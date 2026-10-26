import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { RedisService } from '../src/redis.service';
import { requireLocalTestDatabase } from './local-database';

process.env.DATABASE_URL = requireLocalTestDatabase(process.env.PULSE_TEST_DATABASE_URL);
process.env.NODE_ENV = 'test';
process.env.DEV_TEST_AUTH_ENABLED = 'true';

describe('P01 session boundaries (real local database and sockets)', () => {
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
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  async function identity() {
    const id = `p01-${randomUUID()}`;
    const token = randomUUID();
    await db.user.create({ data: { id, ageGateStatus: 'VERIFIED', sessions: { create: {
      tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60000),
    } } } });
    users.push(id);
    return { id, cookie: `pulse_session=${token}` };
  }
  async function meeting(a: string, b: string, expired = false) {
    const expiresAt = new Date(Date.now() + (expired ? -1000 : 60000));
    const offer = await db.matchOffer.create({ data: {
      userAId: a, userBId: b, status: 'ACCEPTED', expiresAt,
      session: { create: { expiresAt, members: { create: [{ userId: a }, { userId: b }] } } },
    }, include: { session: true } });
    offers.push(offer.id);
    return { offerId: offer.id, sessionId: offer.session!.id };
  }
  async function joined(cookie: string, sessionId: string) {
    const socket = io(`${address}/chat`, { autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: { cookie } });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      socket.connect();
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('join timeout')), 3000);
      socket.once('match.joined', () => { clearTimeout(timer); resolve(); });
      socket.emit('match.join', { sessionId });
    });
    return socket;
  }

  it('T01 rejects an authenticated outsider without closing either member socket', async () => {
    const [a, b, outsider] = await Promise.all([identity(), identity(), identity()]);
    const { sessionId } = await meeting(a.id, b.id);
    const sockets: Socket[] = [];
    try {
      sockets.push(await joined(a.cookie, sessionId), await joined(b.cookie, sessionId));
      const closed = jest.fn();
      sockets.forEach(socket => socket.on('match.closed', closed));
      await request(address).post(`/v1/text-match/sessions/${sessionId}/leave`).set('Cookie', outsider.cookie).expect(403);
      expect((await db.matchSession.findUniqueOrThrow({ where: { id: sessionId } })).status).toBe('ACTIVE');
      const received = new Promise(resolve => sockets[1].once('match.message', resolve));
      sockets[0].emit('match.send', { sessionId, text: 'Still connected', clientMessageId: randomUUID() });
      await expect(received).resolves.toMatchObject({ sessionId, text: 'Still connected' });
      expect(closed).not.toHaveBeenCalled();
      expect(sockets.every(socket => socket.connected)).toBe(true);
    } finally { sockets.forEach(socket => socket.disconnect()); }
  });

  it('T06 rejects a message after TTL without requiring a cleanup request', async () => {
    const [a, b] = await Promise.all([identity(), identity()]);
    const { sessionId } = await meeting(a.id, b.id, true);
    await request(address).post(`/v1/text-match/sessions/${sessionId}/messages`).set('Cookie', a.cookie)
      .send({ text: 'Too late', clientMessageId: randomUUID() }).expect(403);
    expect(await db.matchMessage.count({ where: { sessionId } })).toBe(0);
  });

  it('T08 preserves a new reservation when the other member leaves an old meeting late', async () => {
    const [a, b, c] = await Promise.all([identity(), identity(), identity()]);
    const old = await meeting(a.id, b.id);
    await request(address).post(`/v1/text-match/sessions/${old.sessionId}/leave`).set('Cookie', a.cookie).expect(201);
    const next = await meeting(a.id, c.id);
    await db.activeReservation.createMany({ data: [a.id, c.id].map(userId => ({ userId, offerId: next.offerId, expiresAt: new Date(Date.now() + 60000) })) });
    await request(address).post(`/v1/text-match/sessions/${old.sessionId}/leave`).set('Cookie', b.cookie).expect(201);
    expect(await db.activeReservation.count({ where: { offerId: next.offerId } })).toBe(2);
    await request(address).post(`/v1/text-match/sessions/${old.sessionId}/leave`).set('Cookie', b.cookie).expect(201);
  });
});
