import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { GameAction, GameCommand, GameSnapshot } from '@pulse/contracts';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { RedisService } from '../src/redis.service';
import { requireLocalTestDatabase } from './local-database';

process.env.DATABASE_URL = requireLocalTestDatabase(process.env.PULSE_TEST_DATABASE_URL);
process.env.NODE_ENV = 'test';
type Seat = { token: string; snapshot: GameSnapshot };
describe('local G1 invite → seven rounds → rematch', () => {
  let app: INestApplication;
  let db: PrismaService;
  let address: string;
  let clock: number;
  const rooms: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(RedisService).useValue({ allow: async () => true }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1'); address = await app.getUrl(); db = app.get(PrismaService);
  });
  beforeEach(() => { process.env.LOCAL_GAME_ENABLED = 'true'; clock = Date.now(); jest.spyOn(Date, 'now').mockImplementation(() => clock); });
  afterEach(() => { jest.restoreAllMocks(); process.env.NODE_ENV = 'test'; });
  afterAll(async () => { await db.localGameRoom.deleteMany({ where: { id: { in: rooms } } }); await app.close(); });
  async function create(): Promise<Seat> {
    const response = await request(address).post('/v1/local-game/rooms').send({ nickname: 'Лира', adult: true }).expect(201);
    rooms.push(response.body.snapshot.roomId); return response.body;
  }
  async function read(seat: Seat) {
    const response = await request(address).get(`/v1/local-game/rooms/${seat.snapshot.roomId}`).auth(seat.token, { type: 'bearer' }).expect(200);
    seat.snapshot = response.body as GameSnapshot; return seat.snapshot;
  }
  async function move(seat: Seat, action: GameAction, choice?: number) {
    await read(seat);
    const command: GameCommand = { commandId: randomUUID(), gameId: seat.snapshot.gameId, roundId: seat.snapshot.round.id, expectedVersion: seat.snapshot.version, action, ...(choice === undefined ? {} : { choice }) };
    const response = await request(address).post(`/v1/local-game/rooms/${seat.snapshot.roomId}/commands`).auth(seat.token, { type: 'bearer' }).send(command).expect(201);
    seat.snapshot = response.body; return command;
  }
  async function pair() {
    const a = await create();
    const response = await request(address).post(`/v1/local-game/rooms/${a.snapshot.roomId}/join`).send({ nickname: 'Север', adult: true }).expect(201);
    const b: Seat = response.body;
    await move(a, 'ready'); await move(b, 'ready'); return { a, b };
  }

  it('requires adult consent and an enabled non-production local mode', async () => {
    await request(address).post('/v1/local-game/rooms').send({ nickname: 'Test', adult: false }).expect(400);
    process.env.LOCAL_GAME_ENABLED = 'false'; await request(address).post('/v1/local-game/rooms').send({ nickname: 'Test', adult: true }).expect(403);
    process.env.LOCAL_GAME_ENABLED = 'true'; process.env.NODE_ENV = 'production';
    await request(address).post('/v1/local-game/rooms').send({ nickname: 'Test', adult: true }).expect(403);
  });
  it('refuses outsiders, a third player and duplicate ready racing against stale versions', async () => {
    const { a, b } = await pair();
    await request(address).get(`/v1/local-game/rooms/${a.snapshot.roomId}`).expect(403);
    await request(address).get(`/v1/local-game/rooms/${a.snapshot.roomId}`).auth('x'.repeat(43), { type: 'bearer' }).expect(403);
    await request(address).post(`/v1/local-game/rooms/${a.snapshot.roomId}/join`).send({ nickname: 'Третий', adult: true }).expect(409);
    const stale: GameCommand = { commandId: randomUUID(), gameId: a.snapshot.gameId, roundId: a.snapshot.round.id, expectedVersion: 0, action: 'answer', choice: 0 };
    await request(address).post(`/v1/local-game/rooms/${a.snapshot.roomId}/commands`).auth(a.token, { type: 'bearer' }).send(stale).expect(409);
    expect((await read(b)).phase).toBe('ANSWER');
  });
  it('finishes all seven rounds with hidden choices, accurate scores and a new mutually requested game', async () => {
    const { a, b } = await pair(); const originalGame = a.snapshot.gameId;
    const cards: string[] = [];
    for (let round = 0; round < 6; round++) {
      await read(a); cards.push(a.snapshot.round.prompt);
      expect(a.snapshot.round.number).toBe(round + 1);
      await move(a, 'answer', 1);
      const hidden = await read(b);
      expect(hidden.myChoice).toBeNull(); expect(hidden.reveal).toBeNull();
      expect(JSON.stringify(hidden)).not.toMatch(/tokenHash|cardId|fingerprint|rounds/);
      await move(b, 'answer', 0); await move(a, 'guess', 0);
      expect((await read(b)).reveal).toBeNull();
      const last = await move(b, 'guess', 1);
      expect(b.snapshot.phase).toBe('REVEAL');
      expect(b.snapshot.scores.map(s => s.correct)).toEqual([round + 1, round + 1]);
      const replay = await request(address).post(`/v1/local-game/rooms/${b.snapshot.roomId}/commands`).auth(b.token, { type: 'bearer' }).send(last).expect(201);
      expect(replay.body.scores).toEqual(b.snapshot.scores);
      await request(address).post(`/v1/local-game/rooms/${b.snapshot.roomId}/commands`).auth(b.token, { type: 'bearer' }).send({ ...last, choice: 0 }).expect(409);
      clock += 3001; await move(a, 'next'); await move(b, 'next');
    }
    expect(new Set(cards).size).toBe(6);
    await read(a); expect(a.snapshot.phase).toBe('FINAL'); expect(a.snapshot.round.number).toBe(7);
    await move(a, 'final', 0); expect((await read(b)).story).toBeNull();
    await move(b, 'final', 1); expect(b.snapshot.phase).toBe('RESULTS');
    expect(b.snapshot.story).toContain('кафе на облаке'); expect(b.snapshot.story).toContain('плед');
    expect(b.snapshot.scores.map(s => [s.correct, s.opportunities])).toEqual([[6, 6], [6, 6]]);
    await move(a, 'rematch'); expect((await read(b)).phase).toBe('RESULTS');
    const last = await move(b, 'rematch'); expect(b.snapshot.gameId).not.toBe(originalGame);
    expect(b.snapshot.phase).toBe('ANSWER'); expect(b.snapshot.scores[0].correct).toBe(0);
    expect(cards).not.toContain(b.snapshot.round.prompt);
    const duplicate = await request(address).post(`/v1/local-game/rooms/${b.snapshot.roomId}/commands`).auth(b.token, { type: 'bearer' }).send(last).expect(201);
    expect(duplicate.body.gameId).toBe(b.snapshot.gameId);
  });
  it('serializes concurrent commands so retrying cannot double-submit or score twice', async () => {
    const { a, b } = await pair(); await read(a); await read(b);
    const commands = [a, b].map(seat => ({ commandId: randomUUID(), gameId: seat.snapshot.gameId, roundId: seat.snapshot.round.id, expectedVersion: seat.snapshot.version, action: 'answer', choice: 0 }));
    const responses = await Promise.all([a, b].map((seat, i) => request(address).post(`/v1/local-game/rooms/${seat.snapshot.roomId}/commands`).auth(seat.token, { type: 'bearer' }).send(commands[i])));
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const i = responses.findIndex(r => r.status === 409); const seat = [a, b][i]; await read(seat);
    await request(address).post(`/v1/local-game/rooms/${seat.snapshot.roomId}/commands`).auth(seat.token, { type: 'bearer' }).send({ ...commands[i], expectedVersion: seat.snapshot.version }).expect(201);
    expect((await read(a)).phase).toBe('GUESS');
  });
  it('restores persisted play via a fresh service instance and never leaks skipped secrets', async () => {
    const { a, b } = await pair(); await move(a, 'answer', 1);
    // A fresh HTTP read reconstructs the state from Postgres, with no process game cache.
    const { LocalGameService } = await import('../src/game/local-game');
    const restored = await new LocalGameService(db).read(a.snapshot.roomId, a.token);
    expect(restored.myChoice).toBe(1); expect(restored.gameId).toBe(a.snapshot.gameId);
    await move(b, 'skip'); expect((await read(a)).reveal).toBeNull(); expect(a.snapshot.skipped).toBe(true);
    await move(a, 'leave'); expect((await read(b)).phase).toBe('ENDED');
  });
  it('expires room access using server time', async () => {
    const a = await create(); clock += 86400001;
    await request(address).get(`/v1/local-game/rooms/${a.snapshot.roomId}`).auth(a.token, { type: 'bearer' }).expect(404);
  });
});
