import { Body, Controller, Delete, Get, Inject, Injectable, Param, Post, Req, UseGuards, BadRequestException, ForbiddenException, NotFoundException, ConflictException, HttpException } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma.service';
import { AuthedRequest, SessionGuard } from './auth';
import { RedisService } from './redis.service';
import type { ChatGateway } from './chat.gateway';

const QUEUE_TTL_MS = 5 * 60_000;
const OFFER_TTL_MS = 30_000;
const SESSION_TTL_MS = 2 * 60 * 60_000;
const MESSAGE_RETENTION_MS = 7 * 24 * 60 * 60_000;
type EligibleUser = Prisma.UserGetPayload<{ include: { profile: true } }>;
type ProfiledUser = EligibleUser & { profile: NonNullable<EligibleUser['profile']> };

class QueueDto {
  @IsIn(['ru', 'az', 'en']) language!: string;
  @IsOptional() @IsIn(['talk', 'quiet', 'play']) mood?: string;
  @IsUUID() idempotencyKey!: string;
}
class MessageDto {
  @IsString() @MinLength(1) @MaxLength(1000) text!: string;
  @IsUUID() clientMessageId!: string;
}
class VoteDto { @IsIn([true, false]) wantsContact!: boolean; }

@Injectable()
export class MatchService {
  constructor(private readonly db: PrismaService, private readonly redis: RedisService) {}

  async join(userId: string, input: QueueDto, attempt = 0): Promise<Record<string, unknown>> {
    const now = new Date();
    if (!await this.redis.allow(`${userId}:queue`, 5, 300)) throw new HttpException('Too many queue requests', 429);
    try {
    const result = await this.db.$transaction(async tx => {
      await this.cleanupExpired(tx, now);
      const user = await tx.user.findUnique({ where: { id: userId }, include: { profile: true } });
      this.assertEligible(user);
      const duplicate = await tx.matchQueue.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (duplicate) {
        if (duplicate.userId !== userId) throw new ConflictException('Idempotency key already used');
        const reservation = await tx.activeReservation.findUnique({ where: { userId } });
        if (duplicate.status === 'OFFERED' && reservation && reservation.expiresAt > now) return { state: 'offer_pending', offerId: reservation.offerId, expiresAt: reservation.expiresAt };
        if (duplicate.status === 'WAITING' && duplicate.expiresAt > now) return this.tryPairQueue(tx, userId, duplicate, now);
        if (duplicate.status === 'MATCHED') return { state: 'matched' };
        return { state: duplicate.status.toLowerCase() };
      }
      const slot = await tx.activeQueueSlot.findUnique({ where: { userId }, include: { user: { include: { profile: true } } } });
      if (slot && slot.expiresAt > now) {
        const existing = await tx.matchQueue.findUnique({ where: { id: slot.queueId } });
        if (existing?.status === 'WAITING') return this.tryPairQueue(tx, userId, existing, now);
      }
      if (slot) await tx.activeQueueSlot.delete({ where: { userId } });
      const activeSession = await tx.matchSession.findFirst({ where: { status: 'ACTIVE', expiresAt: { gt: now }, members: { some: { userId, leftAt: null } } }, select: { id: true } });
      if (activeSession) return { state: 'in_session', sessionId: activeSession.id };
      const activeReservation = await tx.activeReservation.findUnique({ where: { userId } });
      if (activeReservation && activeReservation.expiresAt > now) {
        return { state: 'offer_pending', offerId: activeReservation.offerId };
      }
      const queue = await tx.matchQueue.create({ data: { userId, language: input.language, mood: input.mood, idempotencyKey: input.idempotencyKey, expiresAt: new Date(now.getTime() + QUEUE_TTL_MS) } });
      await tx.activeQueueSlot.create({ data: { userId, queueId: queue.id, expiresAt: queue.expiresAt } });

      return this.tryPairQueue(tx, userId, queue, now);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    return result;
    } catch (error) {
      const code = error instanceof Prisma.PrismaClientKnownRequestError ? error.code : '';
      if ((code === 'P2034' || code === 'P2002') && attempt < 2) {
        return this.join(userId, input, attempt + 1);
      }
      if (code === 'P2002') {
        return this.current(userId);
      }
      throw error;
    }
  }

  private async tryPairQueue(tx: Prisma.TransactionClient, userId: string, queue: { id: string; language: string; expiresAt: Date }, now: Date) {
    const currentSlot = await tx.activeQueueSlot.findUnique({ where: { userId } });
    if (!currentSlot || currentSlot.queueId !== queue.id || currentSlot.expiresAt <= now || queue.expiresAt <= now) return { state: 'idle' };
    const activeReservation = await tx.activeReservation.findUnique({ where: { userId } });
    if (activeReservation && activeReservation.expiresAt > now) return { state: 'offer_pending', offerId: activeReservation.offerId, expiresAt: activeReservation.expiresAt };
    const activeSession = await tx.matchSession.findFirst({ where: { status: 'ACTIVE', expiresAt: { gt: now }, members: { some: { userId, leftAt: null } } }, select: { id: true } });
    if (activeSession) return { state: 'in_session', sessionId: activeSession.id };
    const blocked = await tx.userBlock.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
    const excluded = new Set(blocked.map(b => b.blockerId === userId ? b.blockedId : b.blockerId));
    const candidates = await tx.matchQueue.findMany({
      where: { id: { not: queue.id }, status: 'WAITING', language: queue.language, expiresAt: { gt: now }, user: { status: 'ACTIVE', ageGateStatus: 'VERIFIED', profile: { is: { rulesAcceptedAt: { not: null } } }, activeQueueSlot: { isNot: null } } },
      include: { user: { include: { profile: true } } },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }], take: 20,
    });
    const candidate = candidates.find(c => !excluded.has(c.userId) && c.user.profile?.language === queue.language && c.userId !== userId);
    if (!candidate) return { state: 'waiting', queueId: queue.id, expiresAt: queue.expiresAt };

    const offer = await tx.matchOffer.create({ data: { userAId: candidate.userId, userBId: userId, expiresAt: new Date(now.getTime() + OFFER_TTL_MS) } });
    await tx.activeReservation.createMany({ data: [{ userId: candidate.userId, offerId: offer.id, expiresAt: offer.expiresAt }, { userId, offerId: offer.id, expiresAt: offer.expiresAt }] });
    await tx.activeQueueSlot.deleteMany({ where: { userId: { in: [candidate.userId, userId] } } });
    await tx.matchQueue.updateMany({ where: { id: { in: [candidate.id, queue.id] } }, data: { status: 'OFFERED' } });
    return { state: 'offer_pending', offerId: offer.id, expiresAt: offer.expiresAt };
  }

  private async tryMatchWaiting(userId: string, attempt = 0): Promise<Record<string, unknown>> {
    const now = new Date();
    try {
      return await this.db.$transaction(async tx => {
        await this.cleanupExpired(tx, now);
        const slot = await tx.activeQueueSlot.findUnique({ where: { userId } });
        if (!slot || slot.expiresAt <= now) return { state: 'idle' };
        const queue = await tx.matchQueue.findUnique({ where: { id: slot.queueId } });
        if (!queue || queue.status !== 'WAITING') return { state: 'changed' };
        return this.tryPairQueue(tx, userId, queue, now);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) return this.tryMatchWaiting(userId, attempt + 1);
      throw error;
    }
  }

  private async cleanupExpired(tx: Prisma.TransactionClient, now: Date) {
    const expiredSlots = await tx.activeQueueSlot.findMany({ where: { expiresAt: { lte: now } }, select: { userId: true, queueId: true } });
    if (expiredSlots.length) {
      await tx.matchQueue.updateMany({ where: { id: { in: expiredSlots.map(s => s.queueId) }, status: 'WAITING' }, data: { status: 'EXPIRED' } });
      await tx.activeQueueSlot.deleteMany({ where: { userId: { in: expiredSlots.map(s => s.userId) } } });
    }
    const expiredSessions = await tx.matchSession.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, include: { offer: true } });
    if (expiredSessions.length) {
      for (const session of expiredSessions) {
        await tx.matchSession.update({ where: { id: session.id }, data: { status: 'ENDED', endedAt: now } });
        await tx.contactEdge.upsert({ where: { sessionId: session.id }, update: {}, create: { sessionId: session.id, userAId: session.offer.userAId, userBId: session.offer.userBId } });
        await tx.activeReservation.deleteMany({ where: { offerId: session.offerId } });
      }
    }
    const expiredReservations = await tx.activeReservation.findMany({ where: { expiresAt: { lte: now }, offer: { status: 'PENDING' } }, select: { offerId: true, userId: true } });
    if (expiredReservations.length) {
      const offerIds = [...new Set(expiredReservations.map(r => r.offerId))];
      const userIds = [...new Set(expiredReservations.map(r => r.userId))];
      await tx.matchOffer.updateMany({ where: { id: { in: offerIds }, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      await tx.matchQueue.updateMany({ where: { status: 'OFFERED', userId: { in: userIds } }, data: { status: 'EXPIRED' } });
      await tx.activeReservation.deleteMany({ where: { offerId: { in: offerIds } } });
    }
  }

  async current(userId: string): Promise<Record<string, unknown>> {
    const now = new Date();
    await this.db.$transaction(tx => this.cleanupExpired(tx, now));
    const session = await this.currentSession(userId);
    if (session) return { state: 'in_session', session };
    const reservation = await this.db.activeReservation.findUnique({ where: { userId } });
    if (reservation && reservation.expiresAt > now) return { state: 'offer_pending', offerId: reservation.offerId, expiresAt: reservation.expiresAt };
    const slot = await this.db.activeQueueSlot.findUnique({ where: { userId } });
    if (slot && slot.expiresAt > now) {
      const result = await this.tryMatchWaiting(userId);
      if (result.state === 'changed') return this.current(userId);
      return result;
    }
    if (slot) await this.expireQueue(userId, slot.queueId);
    return { state: 'idle' };
  }

  async cancel(userId: string) {
    const slot = await this.db.activeQueueSlot.findUnique({ where: { userId } });
    if (!slot) return this.current(userId);
    await this.db.$transaction([
      this.db.matchQueue.updateMany({ where: { id: slot.queueId, status: 'WAITING' }, data: { status: 'CANCELLED' } }),
      this.db.activeQueueSlot.deleteMany({ where: { userId, queueId: slot.queueId } }),
    ]);
    return { state: 'idle' };
  }

  private async expireQueue(userId: string, queueId: string) {
    await this.db.$transaction([
      this.db.matchQueue.updateMany({ where: { id: queueId, status: 'WAITING' }, data: { status: 'EXPIRED' } }),
      this.db.activeQueueSlot.deleteMany({ where: { userId, queueId } }),
    ]);
  }

  async answerOffer(userId: string, offerId: string, accept: boolean, attempt = 0): Promise<Record<string, unknown>> {
    try {
    return await this.db.$transaction(async tx => {
      const offer = await tx.matchOffer.findUnique({ where: { id: offerId } });
      if (!offer || (offer.userAId !== userId && offer.userBId !== userId)) throw new NotFoundException('Offer not found');
      if (offer.status !== 'PENDING') {
        const session = await tx.matchSession.findUnique({ where: { offerId }, include: { members: { include: { session: { select: { id: true } } } } } });
        return session ? { state: 'in_session', sessionId: session.id } : { state: offer.status.toLowerCase() };
      }
      if (offer.expiresAt <= new Date()) {
        await tx.matchOffer.update({ where: { id: offerId }, data: { status: 'EXPIRED' } });
        await tx.activeReservation.deleteMany({ where: { offerId } });
        await tx.matchQueue.updateMany({ where: { status: 'OFFERED', userId: { in: [offer.userAId, offer.userBId] } }, data: { status: 'EXPIRED' } });
        return { state: 'expired' };
      }
      const blocks = await tx.userBlock.count({ where: { OR: [{ blockerId: userId, blockedId: userId === offer.userAId ? offer.userBId : offer.userAId }, { blockerId: userId === offer.userAId ? offer.userBId : offer.userAId, blockedId: userId }] } });
      if (blocks) {
        await this.releaseOffer(tx, offerId, offer.userAId, offer.userBId, 'CANCELLED');
        return { state: 'cancelled' };
      }
      if (!accept) {
        await this.releaseOffer(tx, offerId, offer.userAId, offer.userBId, 'DECLINED');
        return { state: 'declined' };
      }
      const updated = await tx.matchOffer.update({ where: { id: offerId }, data: offer.userAId === userId ? { acceptedAAt: new Date() } : { acceptedBAt: new Date() } });
      if (!(updated.acceptedAAt && updated.acceptedBAt)) return { state: 'waiting_for_other' };
      const session = await tx.matchSession.create({ data: { offerId, expiresAt: new Date(Date.now() + SESSION_TTL_MS), members: { create: [{ userId: offer.userAId }, { userId: offer.userBId }] } } });
      await tx.matchOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } });
      await tx.activeReservation.updateMany({ where: { offerId }, data: { expiresAt: session.expiresAt } });
      await tx.matchQueue.updateMany({ where: { status: 'OFFERED', userId: { in: [offer.userAId, offer.userBId] } }, data: { status: 'MATCHED' } });
      return { state: 'in_session', sessionId: session.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) return this.answerOffer(userId, offerId, accept, attempt + 1);
      throw error;
    }
  }

  private async releaseOffer(tx: Prisma.TransactionClient, offerId: string, userAId: string, userBId: string, status: 'DECLINED' | 'CANCELLED') {
    await tx.matchOffer.update({ where: { id: offerId }, data: { status } });
    await tx.activeReservation.deleteMany({ where: { offerId } });
    await tx.matchQueue.updateMany({ where: { status: 'OFFERED', userId: { in: [userAId, userBId] } }, data: { status: 'CANCELLED' } });
  }

  async currentSession(userId: string) {
    return this.db.matchSession.findFirst({ where: { status: 'ACTIVE', expiresAt: { gt: new Date() }, members: { some: { userId, leftAt: null } } }, include: { offer: true, members: { where: { leftAt: null } }, messages: { orderBy: { createdAt: 'asc' }, take: 100 } } });
  }

  async sendMessage(userId: string, sessionId: string, input: MessageDto) {
    const member = await this.db.matchMember.findFirst({ where: { sessionId, userId, leftAt: null, session: { status: 'ACTIVE' } }, include: { session: { include: { offer: true } } } });
    if (!member) throw new ForbiddenException('Not an active session member');
    const peerId = member.session.offer.userAId === userId ? member.session.offer.userBId : member.session.offer.userAId;
    if (await this.isBlocked(userId, peerId)) throw new ForbiddenException('Messaging is disabled');
    if (!await this.redis.allow(`${userId}:messages`, 12, 60)) throw new HttpException('Message rate limit reached', 429);
    const text = input.text.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    if (!text) throw new BadRequestException('Message is empty');
    try {
      return await this.db.matchMessage.create({ data: { sessionId, authorId: userId, clientMessageId: input.clientMessageId, text, expiresAt: new Date(Date.now() + MESSAGE_RETENTION_MS) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return this.db.matchMessage.findUnique({ where: { authorId_clientMessageId: { authorId: userId, clientMessageId: input.clientMessageId } } });
      throw error;
    }
  }

  async leave(userId: string, sessionId: string) {
    const member = await this.db.matchMember.findFirst({ where: { sessionId, userId, leftAt: null }, include: { session: { include: { offer: true } } } });
    if (!member) return { state: 'ended' };
    const peerId = member.session.offer.userAId === userId ? member.session.offer.userBId : member.session.offer.userAId;
    await this.db.$transaction(async tx => {
      await tx.matchMember.update({ where: { id: member.id }, data: { leftAt: new Date() } });
      await tx.matchSession.update({ where: { id: sessionId }, data: { status: 'ENDED', endedAt: new Date() } });
      await tx.contactEdge.upsert({ where: { sessionId }, update: {}, create: { sessionId, userAId: member.session.offer.userAId, userBId: member.session.offer.userBId } });
      await tx.activeReservation.deleteMany({ where: { userId: { in: [userId, peerId] } } });
    });
    return { state: 'ended' };
  }

  async contactVote(userId: string, sessionId: string, wantsContact: boolean) {
    const member = await this.db.matchMember.findFirst({ where: { sessionId, userId }, include: { session: { include: { offer: true } } } });
    if (!member || member.session.status === 'ACTIVE') throw new ForbiddenException('Contact votes are available after the match ends');
    const edge = await this.db.contactEdge.findUnique({ where: { sessionId } });
    if (!edge || edge.status === 'BLOCKED' || edge.status === 'REVOKED') throw new ForbiddenException('Contact is unavailable');
    if (await this.isBlocked(userId, member.session.offer.userAId === userId ? member.session.offer.userBId : member.session.offer.userAId)) throw new ForbiddenException('Contact is unavailable');
    const isA = edge.userAId === userId;
    const updated = await this.db.contactEdge.update({ where: { sessionId }, data: { ...(isA ? { voteAAt: wantsContact ? new Date() : null } : { voteBAt: wantsContact ? new Date() : null }), ...(wantsContact ? {} : { status: 'REVOKED' }) } });
    if (updated.voteAAt && updated.voteBAt && updated.status === 'PENDING') return this.db.contactEdge.update({ where: { id: edge.id }, data: { status: 'ACTIVE' } });
    return updated;
  }

  async sendContactMessage(userId: string, contactId: string, input: MessageDto) {
    const edge = await this.db.contactEdge.findUnique({ where: { id: contactId } });
    if (!edge || edge.status !== 'ACTIVE' || (edge.userAId !== userId && edge.userBId !== userId)) throw new ForbiddenException('Mutual contact required');
    if (await this.isBlocked(userId, edge.userAId === userId ? edge.userBId : edge.userAId)) throw new ForbiddenException('Contact is unavailable');
    const text = input.text.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    if (!text) throw new BadRequestException('Message is empty');
    if (!await this.redis.allow(`${userId}:messages`, 12, 60)) throw new HttpException('Message rate limit reached', 429);
    return this.db.contactMessage.create({ data: { contactId, authorId: userId, clientMessageId: input.clientMessageId, text } });
  }

  async listContacts(userId: string) {
    const edges = await this.db.contactEdge.findMany({ where: { status: 'ACTIVE', OR: [{ userAId: userId }, { userBId: userId }] }, orderBy: { createdAt: 'desc' } });
    const peerIds = edges.map(edge => edge.userAId === userId ? edge.userBId : edge.userAId);
    const profiles = await this.db.profile.findMany({ where: { userId: { in: peerIds } } });
    const byUser = new Map(profiles.map(profile => [profile.userId, profile]));
    return edges.map(edge => {
      const peerId = edge.userAId === userId ? edge.userBId : edge.userAId;
      const peer = byUser.get(peerId);
      return { id: edge.id, peer: peer ? { nickname: peer.nickname, avatarPreset: peer.avatarPreset, language: peer.language } : { nickname: 'Пользователь', avatarPreset: 'orbit', language: '' }, createdAt: edge.createdAt };
    });
  }

  async getContactMessages(userId: string, contactId: string) {
    const edge = await this.db.contactEdge.findUnique({ where: { id: contactId } });
    if (!edge || edge.status !== 'ACTIVE' || (edge.userAId !== userId && edge.userBId !== userId)) throw new ForbiddenException('Mutual contact required');
    const peerId = edge.userAId === userId ? edge.userBId : edge.userAId;
    if (await this.isBlocked(userId, peerId)) throw new ForbiddenException('Contact is unavailable');
    return this.db.contactMessage.findMany({ where: { contactId }, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, authorId: true, text: true, clientMessageId: true, createdAt: true } });
  }

  private async isBlocked(a: string, b: string) { return Boolean(await this.db.userBlock.findFirst({ where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] } })); }
  private assertEligible(user: EligibleUser | null): asserts user is ProfiledUser {
    if (!user || user.status !== 'ACTIVE' || user.ageGateStatus !== 'VERIFIED' || !user.profile || !user.profile.rulesAcceptedAt) throw new ForbiddenException('Eligible profile and age verification required');
  }
}

@ApiTags('text-match')
@Controller('text-match')
@UseGuards(SessionGuard)
export class MatchController {
  constructor(private readonly matches: MatchService, @Inject('CHAT_GATEWAY') private readonly chat: ChatGateway) {}
  @Post('queue') join(@Req() req: AuthedRequest, @Body() body: QueueDto) { return this.matches.join(req.userId!, body); }
  @Get('queue/current') current(@Req() req: AuthedRequest) { return this.matches.current(req.userId!); }
  @Delete('queue/current') cancel(@Req() req: AuthedRequest) { return this.matches.cancel(req.userId!); }
  @Post('offers/:id/accept') accept(@Req() req: AuthedRequest, @Param('id') id: string) { return this.matches.answerOffer(req.userId!, id, true); }
  @Post('offers/:id/decline') decline(@Req() req: AuthedRequest, @Param('id') id: string) { return this.matches.answerOffer(req.userId!, id, false); }
  @Get('sessions/current') session(@Req() req: AuthedRequest) { return this.matches.currentSession(req.userId!); }
  @Post('sessions/:id/leave') async leave(@Req() req: AuthedRequest, @Param('id') id: string) { const result = await this.matches.leave(req.userId!, id); this.chat.closeSession(id, 'ended'); return result; }
  @Post('sessions/:id/contact-vote') vote(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: VoteDto) { return this.matches.contactVote(req.userId!, id, body.wantsContact); }
  @Post('sessions/:id/messages') message(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: MessageDto) { return this.matches.sendMessage(req.userId!, id, body); }
  @Post('contacts/:id/messages') contactMessage(@Req() req: AuthedRequest, @Param('id') id: string, @Body() body: MessageDto) { return this.matches.sendContactMessage(req.userId!, id, body); }
  @Get('contacts') contacts(@Req() req: AuthedRequest) { return this.matches.listContacts(req.userId!); }
  @Get('contacts/:id/messages') contactMessages(@Req() req: AuthedRequest, @Param('id') id: string) { return this.matches.getContactMessages(req.userId!, id); }
}
