import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { RedisService } from '../src/redis.service';
import { requireLocalTestDatabase } from './local-database';

process.env.DATABASE_URL = requireLocalTestDatabase(process.env.PULSE_TEST_DATABASE_URL);
process.env.NODE_ENV = 'test';
process.env.DEV_TEST_AUTH_ENABLED = 'true';

describe('T03 pair-scoped blocking', () => {
  let app: INestApplication;
  let db: PrismaService;
  let address: string;
  const users: string[] = [];
  const offers: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService).useValue({ allow: async () => true }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');
    address = await app.getUrl();
    db = app.get(PrismaService);
  });
  afterAll(async () => {
    await db.matchOffer.deleteMany({ where: { id: { in: offers } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });
  async function identity() {
    const id = `t03-${randomUUID()}`;
    const token = randomUUID();
    await db.user.create({ data: { id, ageGateStatus: 'VERIFIED', sessions: { create: {
      tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60000),
    } } } });
    users.push(id);
    return { id, cookie: `pulse_session=${token}` };
  }
  async function queued(userId: string, status: 'WAITING' | 'OFFERED') {
    const expiresAt = new Date(Date.now() + 60000);
    const queue = await db.matchQueue.create({ data: { userId, language: 'ru', status, expiresAt, idempotencyKey: randomUUID() } });
    if (status === 'WAITING') await db.activeQueueSlot.create({ data: { userId, queueId: queue.id, expiresAt } });
    return queue;
  }
  async function paired(a: string, b: string, active = false) {
    const expiresAt = new Date(Date.now() + 60000);
    const offer = await db.matchOffer.create({ data: { userAId: a, userBId: b, expiresAt, status: active ? 'ACCEPTED' : 'PENDING',
      ...(active ? { session: { create: { expiresAt, members: { create: [{ userId: a }, { userId: b }] } } } } : {}),
      reservations: { create: [a, b].map(userId => ({ userId, expiresAt })) },
    }, include: { session: true } });
    offers.push(offer.id);
    return offer;
  }

  it('keeps both waiting slots while excluding the blocked pair', async () => {
    const [a, b] = await Promise.all([identity(), identity()]);
    const queues = await Promise.all([queued(a.id, 'WAITING'), queued(b.id, 'WAITING')]);
    await request(address).post('/v1/safety/blocks').set('Cookie', a.cookie).send({ targetUserId: b.id }).expect(201);
    expect(await db.activeQueueSlot.count({ where: { userId: { in: [a.id, b.id] } } })).toBe(2);
    expect(await db.matchQueue.count({ where: { id: { in: queues.map(q => q.id) }, status: 'WAITING' } })).toBe(2);
    expect(await db.userBlock.count({ where: { blockerId: a.id, blockedId: b.id } })).toBe(1);
  });

  it('preserves third-party offers and their queue rows on both sides', async () => {
    const [a, b, c, d] = await Promise.all([identity(), identity(), identity(), identity()]);
    const [ad, bc] = await Promise.all([paired(a.id, d.id), paired(b.id, c.id)]);
    const queues = await Promise.all([a.id, b.id, c.id, d.id].map(id => queued(id, 'OFFERED')));
    await request(address).post('/v1/safety/blocks').set('Cookie', a.cookie).send({ targetUserId: b.id }).expect(201);
    expect(await db.activeReservation.count({ where: { offerId: { in: [ad.id, bc.id] } } })).toBe(4);
    expect(await db.matchOffer.count({ where: { id: { in: [ad.id, bc.id] }, status: 'PENDING' } })).toBe(2);
    expect(await db.matchQueue.count({ where: { id: { in: queues.map(q => q.id) }, status: 'OFFERED' } })).toBe(4);
    // Both independent pairs can still accept their original offers.
    for (const [offer, left, right] of [[ad, a, d], [bc, b, c]] as const) {
      await request(address).post(`/v1/text-match/offers/${offer.id}/accept`).set('Cookie', left.cookie).expect(201);
      await request(address).post(`/v1/text-match/offers/${offer.id}/accept`).set('Cookie', right.cookie).expect(201)
        .expect(({ body }) => expect(body.state).toBe('in_session'));
    }
  });

  it('preserves an active B-C meeting when A blocks B', async () => {
    const [a, b, c] = await Promise.all([identity(), identity(), identity()]);
    const bc = await paired(b.id, c.id, true);
    await request(address).post('/v1/safety/blocks').set('Cookie', a.cookie).send({ targetUserId: b.id }).expect(201);
    expect(await db.activeReservation.count({ where: { offerId: bc.id } })).toBe(2);
    expect((await db.matchSession.findUniqueOrThrow({ where: { id: bc.session!.id } })).status).toBe('ACTIVE');
    await request(address).post(`/v1/text-match/sessions/${bc.session!.id}/messages`).set('Cookie', b.cookie)
      .send({ text: 'Independent meeting', clientMessageId: randomUUID() }).expect(201);
  });

  it.each([false, true])('cancels the actual pending pair, orientation reversed=%s, without harming its next offer', async reversed => {
    const [a, b, c] = await Promise.all([identity(), identity(), identity()]);
    const old = await paired(reversed ? b.id : a.id, reversed ? a.id : b.id);
    const queues = await Promise.all([queued(a.id, 'OFFERED'), queued(b.id, 'OFFERED')]);
    await request(address).post('/v1/safety/blocks').set('Cookie', a.cookie).send({ targetUserId: b.id }).expect(201);
    expect((await db.matchOffer.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('CANCELLED');
    expect(await db.activeReservation.count({ where: { offerId: old.id } })).toBe(0);
    expect(await db.matchQueue.count({ where: { id: { in: queues.map(q => q.id) }, status: 'CANCELLED' } })).toBe(2);
    const next = await paired(b.id, c.id);
    const nextQueues = await Promise.all([queued(b.id, 'OFFERED'), queued(c.id, 'OFFERED')]);
    await request(address).post('/v1/safety/blocks').set('Cookie', a.cookie).send({ targetUserId: b.id }).expect(201);
    expect(await db.activeReservation.count({ where: { offerId: next.id } })).toBe(2);
    expect(await db.matchQueue.count({ where: { id: { in: nextQueues.map(q => q.id) }, status: 'OFFERED' } })).toBe(2);
  });

  it.each([false, true])('serializes acceptance against blocking, orientation reversed=%s', async reversed => {
    const [a, b, c, d] = await Promise.all([identity(), identity(), identity(), identity()]);
    const ab = await paired(reversed ? b.id : a.id, reversed ? a.id : b.id);
    const cd = await paired(c.id, d.id);
    await request(address).post(`/v1/text-match/offers/${ab.id}/accept`).set('Cookie', a.cookie).expect(201);
    const responses = await Promise.all([
      request(address).post('/v1/safety/blocks').set('Cookie', a.cookie).send({ targetUserId: b.id }),
      request(address).post(`/v1/text-match/offers/${ab.id}/accept`).set('Cookie', b.cookie),
    ]);
    expect(responses.map(response => response.status)).toEqual([201, 201]);
    const session = await db.matchSession.findUnique({ where: { offerId: ab.id } });
    if (session) {
      expect(session.status).toBe('BLOCKED');
      await request(address).post(`/v1/text-match/sessions/${session.id}/messages`).set('Cookie', b.cookie)
        .send({ text: 'After block', clientMessageId: randomUUID() }).expect(403);
    } else {
      expect((await db.matchOffer.findUniqueOrThrow({ where: { id: ab.id } })).status).toBe('CANCELLED');
    }
    expect(await db.activeReservation.count({ where: { offerId: ab.id } })).toBe(0);
    expect(await db.activeReservation.count({ where: { offerId: cd.id } })).toBe(2);
    expect((await db.matchOffer.findUniqueOrThrow({ where: { id: cd.id } })).status).toBe('PENDING');
  });
});
