import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, Body, CanActivate, ConflictException, Controller, ExecutionContext, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import type { GameAction, GameCommand } from '@pulse/contracts';
import { PrismaService } from '../prisma.service';
import { applyCommand, createGame, GameRuleError, type GameState, snapshot, tick, type Player } from './engine';

class JoinDto {
  @IsString() @MinLength(1) @MaxLength(24) nickname!: string;
  @IsIn([true]) adult!: true;
  @IsOptional() @IsIn(['normal', 'relaxed']) pace?: 'normal' | 'relaxed';
}
class CommandDto implements GameCommand {
  @IsUUID() commandId!: string;
  @IsUUID() gameId!: string;
  @IsString() @MaxLength(64) roundId!: string;
  @IsInt() @Min(0) expectedVersion!: number;
  @IsIn(['ready', 'answer', 'guess', 'skip', 'next', 'final', 'rematch', 'leave', 'react', 'extend', 'here']) action!: GameAction;
  @IsOptional() @IsInt() @Min(0) @Max(2) choice?: number;
  @IsOptional() @IsString() @MaxLength(8) reaction?: string;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const json = (state: GameState) => state as unknown as Prisma.InputJsonValue;
const token = (req: Request) => req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];

@Injectable()
export class LocalGameGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const address = req.socket.remoteAddress;
    if (process.env.LOCAL_GAME_ENABLED !== 'true' || process.env.NODE_ENV === 'production' || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address ?? '')) {
      throw new ForbiddenException('Локальная игра выключена');
    }
    return true;
  }
}

@Injectable()
export class LocalGameService {
  constructor(private readonly db: PrismaService) {}
  private player(input: JoinDto) {
    const nickname = input.nickname.trim().replace(/[\u0000-\u001f\u007f]/g, '');
    if (!nickname || nickname.length > 24 || input.adult !== true) throw new BadRequestException('Укажи имя и подтверди возраст 18+');
    const rawToken = randomBytes(32).toString('base64url');
    const player: Player = { id: randomUUID(), nickname, tokenHash: hash(rawToken), ready: false, lastSeenAt: Date.now(), idle: 0, rematch: false };
    return { rawToken, player };
  }
  async create(input: JoinDto) {
    const { player, rawToken } = this.player(input);
    const id = randomBytes(8).toString('hex');
    const state = createGame([player], input.pace ?? 'normal');
    // Local prototype data expires after one day. Cleanup never touches other application tables.
    await this.db.localGameRoom.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.db.localGameRoom.create({ data: { id, state: json(state), expiresAt: new Date(Date.now() + 86400000) } });
    return { token: rawToken, snapshot: snapshot(id, state, player.id, Date.now()) };
  }
  private async locked<T>(id: string, run: (state: GameState, now: number) => T) {
    if (!/^[a-f0-9]{16}$/.test(id)) throw new NotFoundException('Комната не найдена');
    return this.db.$transaction(async tx => {
      const [room] = await tx.$queryRaw<{ state: Prisma.JsonValue; expiresAt: Date }[]>`SELECT state, "expiresAt" FROM "LocalGameRoom" WHERE id = ${id} FOR UPDATE`;
      const now = Date.now();
      if (!room || room.expiresAt.getTime() <= now) throw new NotFoundException('Приглашение истекло. Создай новую комнату.');
      const state = room.state as unknown as GameState;
      const result = run(state, now);
      await tx.localGameRoom.update({ where: { id }, data: { state: json(state) } });
      return result;
    }, { maxWait: 3000, timeout: 5000 });
  }
  async join(id: string, input: JoinDto) {
    const { player, rawToken } = this.player(input);
    return this.locked(id, (state, now) => {
      if (state.players.length >= 2 || state.phase !== 'LOBBY') throw new ConflictException('В комнате уже двое. Можно создать свою встречу.');
      state.players.push(player); state.version++;
      return { token: rawToken, snapshot: snapshot(id, state, player.id, now) };
    });
  }
  private identify(state: GameState, rawToken: string | undefined) {
    if (!rawToken) throw new ForbiddenException('Для входа нужна игровая сессия этой вкладки');
    const player = state.players.find(p => p.tokenHash === hash(rawToken));
    if (!player) throw new ForbiddenException('Эта игровая сессия не относится к комнате');
    return player;
  }
  async read(id: string, rawToken: string | undefined) {
    return this.locked(id, (state, now) => {
      const player = this.identify(state, rawToken);
      player.lastSeenAt = now;
      tick(state, now);
      return snapshot(id, state, player.id, now);
    });
  }
  async command(id: string, rawToken: string | undefined, command: CommandDto) {
    const outcome = await this.locked(id, (state, now) => {
      const player = this.identify(state, rawToken);
      const key = `${player.id}:${command.commandId}`;
      const fingerprint = hash(JSON.stringify([command.gameId, command.roundId, command.action, command.choice ?? null, command.reaction ?? null]));
      const receipt = state.receipts.find(r => r.key === key);
      if (receipt && receipt.fingerprint !== fingerprint) throw new ConflictException('Идентификатор хода уже использован');
      tick(state, now);
      if (receipt) return { data: snapshot(id, state, player.id, now) };
      if (command.gameId !== state.gameId || command.roundId !== `${state.gameId}:${state.roundIndex}`) return { stale: true };
      if (command.action !== 'leave' && command.expectedVersion !== state.version) return { stale: true };
      try { applyCommand(state, player.id, command, now); }
      catch (error) { if (error instanceof GameRuleError) throw new BadRequestException(error.message); throw error; }
      player.lastSeenAt = now;
      state.receipts = [...state.receipts, { key, fingerprint }].slice(-200);
      return { data: snapshot(id, state, player.id, now) };
    });
    // Commit deadline transitions even when rejecting a stale command.
    if (outcome.stale) throw new ConflictException('Состояние изменилось. Обновляем ход.');
    return outcome.data!;
  }
}

@Controller('local-game/rooms')
@UseGuards(LocalGameGuard)
export class LocalGameController {
  constructor(private readonly games: LocalGameService) {}
  @Post() create(@Body() body: JoinDto) { return this.games.create(body); }
  @Post(':id/join') join(@Param('id') id: string, @Body() body: JoinDto) { return this.games.join(id, body); }
  @Get(':id') read(@Param('id') id: string, @Req() req: Request) { return this.games.read(id, token(req)); }
  @Post(':id/commands') command(@Param('id') id: string, @Req() req: Request, @Body() body: CommandDto) { return this.games.command(id, token(req), body); }
}
