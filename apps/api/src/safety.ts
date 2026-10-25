import { Body, Controller, ForbiddenException, Get, Inject, Injectable, Param, Post, Req, UseGuards, BadRequestException, NotFoundException, HttpException } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service';
import { AuthedRequest, SessionGuard } from './auth';
import { RedisService } from './redis.service';
import type { ChatGateway } from './chat.gateway';

class BlockDto { @IsString() targetUserId!: string; }
class ReportDto {
  @IsString() targetUserId!: string;
  @IsOptional() @IsString() sessionId?: string;
  @IsIn(['harassment', 'minor_safety', 'spam', 'scam', 'personal_data', 'other']) category!: string;
  @IsOptional() @IsString() @MaxLength(500) details?: string;
}
class ReviewDto { @IsIn(['dismiss', 'suspend']) action!: string; @IsOptional() @IsString() @MaxLength(300) reason?: string; }

@Injectable()
export class SafetyService {
  constructor(private readonly db: PrismaService, private readonly redis: RedisService) {}

  async block(userId: string, targetUserId: string) {
    if (!await this.redis.allow(`${userId}:blocks`, 10, 3600)) throw new HttpException('Too many block requests', 429);
    if (!targetUserId || targetUserId === userId) throw new BadRequestException('Invalid target');
    const target = await this.db.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    const sessions = await this.db.matchSession.findMany({ where: { status: 'ACTIVE', offer: { OR: [{ userAId: userId, userBId: targetUserId }, { userAId: targetUserId, userBId: userId }] } }, select: { id: true } });
    await this.db.$transaction(async tx => {
      await tx.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: userId, blockedId: targetUserId } }, update: {}, create: { blockerId: userId, blockedId: targetUserId } });
      await tx.auditEvent.create({ data: { actorId: userId, subjectId: targetUserId, action: 'user.blocked' } });
      await tx.matchOffer.updateMany({ where: { status: 'PENDING', OR: [{ userAId: userId, userBId: targetUserId }, { userAId: targetUserId, userBId: userId }] }, data: { status: 'CANCELLED' } });
      await tx.activeReservation.deleteMany({ where: { userId: { in: [userId, targetUserId] } } });
      await tx.activeQueueSlot.deleteMany({ where: { userId: { in: [userId, targetUserId] } } });
      await tx.matchQueue.updateMany({ where: { status: { in: ['WAITING', 'OFFERED'] }, userId: { in: [userId, targetUserId] } }, data: { status: 'CANCELLED' } });
      await tx.matchSession.updateMany({ where: { status: 'ACTIVE', offer: { OR: [{ userAId: userId, userBId: targetUserId }, { userAId: targetUserId, userBId: userId }] } }, data: { status: 'BLOCKED', endedAt: new Date() } });
      await tx.contactEdge.updateMany({ where: { OR: [{ userAId: userId, userBId: targetUserId }, { userAId: targetUserId, userBId: userId }] }, data: { status: 'BLOCKED' } });
    });
    return { ok: true, sessionIds: sessions.map(session => session.id) };
  }

  async report(reporterId: string, input: ReportDto) {
    if (!await this.redis.allow(`${reporterId}:reports`, 5, 3600)) throw new HttpException('Too many report requests', 429);
    if (reporterId === input.targetUserId) throw new BadRequestException('Cannot report yourself');
    const target = await this.db.user.findUnique({ where: { id: input.targetUserId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    if (input.sessionId) {
      const membership = await this.db.matchMember.findFirst({ where: { sessionId: input.sessionId, userId: reporterId } });
      if (!membership) throw new ForbiddenException('Report context is unavailable');
    }
    return this.db.$transaction(async tx => {
      const report = await tx.report.create({ data: { reporterId, targetUserId: input.targetUserId, sessionId: input.sessionId, category: input.category, details: input.details?.trim() } });
      await tx.auditEvent.create({ data: { actorId: reporterId, subjectId: report.id, action: 'report.submitted', metadata: { category: input.category, hasDetails: Boolean(input.details) } } });
      return { id: report.id, status: report.status };
    });
  }

  async moderatorQueue(userId: string) {
    await this.requireModerator(userId);
    return this.db.report.findMany({ where: { status: { in: ['OPEN', 'REVIEWING'] } }, select: { id: true, reporterId: true, targetUserId: true, sessionId: true, category: true, details: true, createdAt: true, status: true }, orderBy: { createdAt: 'asc' }, take: 100 });
  }

  async review(userId: string, reportId: string, input: ReviewDto) {
    await this.requireModerator(userId);
    return this.db.$transaction(async tx => {
      const report = await tx.report.findUnique({ where: { id: reportId } });
      if (!report || report.status === 'ACTIONED' || report.status === 'DISMISSED') throw new NotFoundException('Open report not found');
      const status = input.action === 'dismiss' ? 'DISMISSED' : 'ACTIONED';
      if (input.action === 'suspend') await tx.user.update({ where: { id: report.targetUserId }, data: { status: 'SUSPENDED' } });
      const updated = await tx.report.update({ where: { id: reportId }, data: { status, reviewedAt: new Date() } });
      await tx.auditEvent.create({ data: { actorId: userId, subjectId: report.targetUserId, action: input.action === 'suspend' ? 'moderation.user_suspended' : 'moderation.report_dismissed', metadata: { reportId, reason: input.reason } } });
      if (input.action === 'suspend') {
        await tx.authSession.updateMany({ where: { userId: report.targetUserId, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.activeQueueSlot.deleteMany({ where: { userId: report.targetUserId } });
        await tx.activeReservation.deleteMany({ where: { userId: report.targetUserId } });
        await tx.matchSession.updateMany({ where: { status: 'ACTIVE', members: { some: { userId: report.targetUserId, leftAt: null } } }, data: { status: 'BLOCKED', endedAt: new Date() } });
      }
      return { id: updated.id, status: updated.status };
    });
  }

  private async requireModerator(userId: string) {
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
    if (!user || user.status !== 'ACTIVE' || (user.role !== 'MODERATOR' && user.role !== 'ADMIN')) throw new ForbiddenException('Moderator role required');
  }
}

@ApiTags('safety')
@Controller('safety')
@UseGuards(SessionGuard)
export class SafetyController {
  constructor(private readonly safety: SafetyService, @Inject('CHAT_GATEWAY') private readonly chat: ChatGateway) {}
  @Post('blocks') async block(@Req() req: AuthedRequest, @Body() body: BlockDto) { const result = await this.safety.block(req.userId!, body.targetUserId); result.sessionIds.forEach(id => this.chat.closeSession(id, 'blocked')); return { ok: result.ok }; }
  @Post('reports') report(@Req() req: AuthedRequest, @Body() body: ReportDto) { return this.safety.report(req.userId!, body); }
  @Get('moderation/reports') queue(@Req() req: AuthedRequest) { return this.safety.moderatorQueue(req.userId!); }
  @Post('moderation/reports/:id') review(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: ReviewDto) { return this.safety.review(req.userId!, id, body); }
}
