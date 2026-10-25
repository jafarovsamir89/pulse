import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { RedisService } from '../src/redis.service';

const testDatabase = process.env.PULSE_TEST_DATABASE_URL;
if (!testDatabase || !testDatabase.includes('127.0.0.1') || !new URL(testDatabase).pathname.endsWith('/pulse_test')) {
  throw new Error('Set PULSE_TEST_DATABASE_URL to the dedicated /pulse_test database on 127.0.0.1 before running API integration tests.');
}
process.env.DATABASE_URL = testDatabase;
process.env.NODE_ENV = 'test';
process.env.DEV_TEST_AUTH_ENABLED = 'true';
process.env.WEB_ORIGIN = 'http://localhost:5173';

describe('PULSE Text Match local end-to-end contracts', () => {
  let app: INestApplication;
  let db: PrismaService;
  let address: string;
  let cookieA: string;
  let cookieB: string;
  const userA = 'test-adult-a';
  const userB = 'test-adult-b';

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService).useValue({ allow: async () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const serverAddress = app.getHttpServer().address();
    address = `http://127.0.0.1:${serverAddress.port}`;
    db = app.get(PrismaService);
    await db.contactMessage.deleteMany();
    await db.contactEdge.deleteMany();
    await db.auditEvent.deleteMany();
    await db.report.deleteMany();
    await db.userBlock.deleteMany();
    await db.matchMessage.deleteMany();
    await db.matchMember.deleteMany();
    await db.matchSession.deleteMany();
    await db.activeReservation.deleteMany();
    await db.matchOffer.deleteMany();
    await db.activeQueueSlot.deleteMany();
    await db.matchQueue.deleteMany();
    await db.authSession.deleteMany();
    await db.profile.deleteMany();
    await db.user.deleteMany({ where: { id: { in: ['test-adult-a', 'test-adult-b'] } } });
  });

  afterAll(async () => { await app?.close(); });

  it('requires a synthetic account, a profile and server-verified eligibility before matching', async () => {
    const loginA = await request(address).post('/v1/auth/dev-session').send({ identity: 'test-adult-a' }).expect(201);
    const loginB = await request(address).post('/v1/auth/dev-session').send({ identity: 'test-adult-b' }).expect(201);
    cookieA = loginA.headers['set-cookie'][0].split(';')[0];
    cookieB = loginB.headers['set-cookie'][0].split(';')[0];
    await request(address).post('/v1/text-match/queue').set('Cookie', cookieA).send({ language: 'ru', idempotencyKey: crypto.randomUUID() }).expect(403);
    await request(address).patch('/v1/me/profile').set('Cookie', cookieA).send({ nickname: 'Лира', language: 'ru', avatarPreset: 'orbit', acceptRules: true }).expect(200);
    await request(address).patch('/v1/me/profile').set('Cookie', cookieB).send({ nickname: 'Север', language: 'ru', avatarPreset: 'orbit', acceptRules: true }).expect(200);
  });

  it('matches two real test identities once, gates access, exchanges socket messages, and requires mutual contact consent', async () => {
    const idempotencyKey = crypto.randomUUID();
    const parallel = await Promise.all([
      request(address).post('/v1/text-match/queue').set('Cookie', cookieA).send({ language: 'ru', idempotencyKey }),
      request(address).post('/v1/text-match/queue').set('Cookie', cookieA).send({ language: 'ru', idempotencyKey: crypto.randomUUID() }),
    ]);
    expect(parallel.every(result => result.status === 201)).toBe(true);
    expect(parallel[0].body.queueId).toBe(parallel[1].body.queueId);
    const first = parallel[0];
    expect(first.body.state).toBe('waiting');
    const duplicate = await request(address).post('/v1/text-match/queue').set('Cookie', cookieA).send({ language: 'ru', idempotencyKey }).expect(201);
    expect(duplicate.body.queueId).toBe(first.body.queueId);
    const arrivals = await Promise.all([
      request(address).post('/v1/text-match/queue').set('Cookie', cookieB).send({ language: 'ru', idempotencyKey: crypto.randomUUID() }),
      request(address).post('/v1/text-match/queue').set('Cookie', cookieA).send({ language: 'ru', idempotencyKey: crypto.randomUUID() }),
    ]);
    expect(arrivals.every(result => result.status === 201)).toBe(true);
    const states = await Promise.all([
      request(address).get('/v1/text-match/queue/current').set('Cookie', cookieA),
      request(address).get('/v1/text-match/queue/current').set('Cookie', cookieB),
    ]);
    expect(states.map(result => result.body.state)).toEqual(['offer_pending', 'offer_pending']);
    expect(states[0].body.offerId).toBe(states[1].body.offerId);
    const offerId = states[1].body.offerId as string;
    await request(address).post(`/v1/text-match/offers/${offerId}/accept`).set('Cookie', cookieA).expect(201).expect(({ body }) => expect(body.state).toBe('waiting_for_other'));
    await request(address).post(`/v1/text-match/offers/${offerId}/accept`).set('Cookie', cookieB).expect(201).expect(({ body }) => expect(body.state).toBe('in_session'));
    const currentA = await request(address).get('/v1/text-match/queue/current').set('Cookie', cookieA).expect(200);
    const currentB = await request(address).get('/v1/text-match/queue/current').set('Cookie', cookieB).expect(200);
    const sessionId = currentA.body.session.id as string;
    expect(currentB.body.session.id).toBe(sessionId);
    await request(address).post(`/v1/text-match/sessions/${sessionId}/messages`).set('Cookie', cookieA).send({ text: 'Салют', clientMessageId: crypto.randomUUID() }).expect(201);
    await request(address).post(`/v1/text-match/sessions/${sessionId}/messages`).set('Cookie', cookieB).send({ text: 'private', clientMessageId: crypto.randomUUID() }).expect(201);
    await request(address).post('/v1/text-match/sessions/not-their-session/messages').set('Cookie', cookieA).send({ text: 'nope', clientMessageId: crypto.randomUUID() }).expect(403);

    const port = Number(new URL(address).port);
    let socketA = io(`http://127.0.0.1:${port}/chat`, { forceNew: true, extraHeaders: { cookie: cookieA }, transports: ['websocket'] });
    const socketB = io(`http://127.0.0.1:${port}/chat`, { forceNew: true, extraHeaders: { cookie: cookieB }, transports: ['websocket'] });
    try {
      await Promise.all([onceConnect(socketA), onceConnect(socketB)]);
      const joinedA = socketJoin(socketA, sessionId);
      const joinedB = socketJoin(socketB, sessionId);
      await Promise.all([joinedA, joinedB]);
      const received = new Promise<MessageEvent>(resolve => socketB.once('match.message', resolve));
      await socketSend(socketA, { sessionId, text: 'Привет в реальном времени', clientMessageId: crypto.randomUUID() });
      await expect(received).resolves.toMatchObject({ sessionId, text: 'Привет в реальном времени' });
      socketA.disconnect();
      socketA = io(`http://127.0.0.1:${port}/chat`, { forceNew: true, extraHeaders: { cookie: cookieA }, transports: ['websocket'] });
      await onceConnect(socketA);
      await socketJoin(socketA, sessionId);
    } finally { socketA.disconnect(); socketB.disconnect(); }

    await request(address).post(`/v1/text-match/sessions/${sessionId}/leave`).set('Cookie', cookieA).expect(201);
    await request(address).post(`/v1/text-match/sessions/${sessionId}/leave`).set('Cookie', cookieB).expect(201);
    const edge = await db.contactEdge.findUnique({ where: { sessionId } });
    expect(edge?.status).toBe('PENDING');
    await request(address).post(`/v1/text-match/sessions/${sessionId}/contact-vote`).set('Cookie', cookieA).send({ wantsContact: true }).expect(201);
    await request(address).post(`/v1/text-match/contacts/${edge?.id}/messages`).set('Cookie', cookieA).send({ text: 'blocked until mutual', clientMessageId: crypto.randomUUID() }).expect(403);
    await request(address).post(`/v1/text-match/sessions/${sessionId}/contact-vote`).set('Cookie', cookieB).send({ wantsContact: true }).expect(201);
    await request(address).post(`/v1/text-match/contacts/${edge?.id}/messages`).set('Cookie', cookieA).send({ text: 'Теперь можно', clientMessageId: crypto.randomUUID() }).expect(201);
    const contacts = await request(address).get('/v1/text-match/contacts').set('Cookie', cookieA).expect(200);
    expect(contacts.body).toHaveLength(1);
    await request(address).get(`/v1/text-match/contacts/${edge?.id}/messages`).set('Cookie', cookieA).expect(200).expect(({ body }) => expect(body).toHaveLength(1));

    await request(address).post('/v1/safety/reports').set('Cookie', cookieA).send({ targetUserId: userB, sessionId, category: 'other' }).expect(201);
    await db.user.update({ where: { id: userA }, data: { role: 'MODERATOR' } });
    const reportQueue = await request(address).get('/v1/safety/moderation/reports').set('Cookie', cookieA).expect(200);
    expect(reportQueue.body).toHaveLength(1);
    await request(address).post(`/v1/safety/moderation/reports/${reportQueue.body[0].id}`).set('Cookie', cookieA).send({ action: 'dismiss', reason: 'synthetic test review' }).expect(201);
    await request(address).post('/v1/safety/blocks').set('Cookie', cookieA).send({ targetUserId: userB }).expect(201);
    await request(address).post(`/v1/text-match/contacts/${edge?.id}/messages`).set('Cookie', cookieA).send({ text: 'after block', clientMessageId: crypto.randomUUID() }).expect(403);
  });

  it('cancels and expires local queue entries, then revokes a deletion-requesting account', async () => {
    const queued = await request(address).post('/v1/text-match/queue').set('Cookie', cookieA).send({ language: 'ru', idempotencyKey: crypto.randomUUID() }).expect(201);
    expect(queued.body.state).toBe('waiting');
    const blockedPeer = await request(address).post('/v1/text-match/queue').set('Cookie', cookieB).send({ language: 'ru', idempotencyKey: crypto.randomUUID() }).expect(201);
    expect(blockedPeer.body.state).toBe('waiting');
    expect((await request(address).get('/v1/text-match/queue/current').set('Cookie', cookieA)).body.state).toBe('waiting');
    expect((await request(address).get('/v1/text-match/queue/current').set('Cookie', cookieB)).body.state).toBe('waiting');
    await request(address).delete('/v1/text-match/queue/current').set('Cookie', cookieB).expect(200);
    await request(address).delete('/v1/text-match/queue/current').set('Cookie', cookieA).expect(200);
    expect((await request(address).get('/v1/text-match/queue/current').set('Cookie', cookieA)).body.state).toBe('idle');
    const expiring = await request(address).post('/v1/text-match/queue').set('Cookie', cookieA).send({ language: 'ru', idempotencyKey: crypto.randomUUID() }).expect(201);
    await db.activeQueueSlot.update({ where: { userId: userA }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(address).get('/v1/text-match/queue/current').set('Cookie', cookieA)).body.state).toBe('idle');
    expect((await db.matchQueue.findUnique({ where: { id: expiring.body.queueId } }))?.status).toBe('EXPIRED');
    await request(address).delete('/v1/me').set('Cookie', cookieA).expect(200);
    await request(address).get('/v1/me').set('Cookie', cookieA).expect(401);
  });

  it('refuses development identities in production configuration', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try { await request(address).post('/v1/auth/dev-session').send({ identity: 'test-adult-a' }).expect(403); }
    finally { process.env.NODE_ENV = previous; }
  });
});

type MessageEvent = { sessionId: string; text: string; authorId: string };
function onceConnect(socket: Socket) {
  return new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
    socket.connect();
  });
}
function socketJoin(socket: Socket, sessionId: string) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket room join timed out')), 3000);
    socket.once('match.joined', () => { clearTimeout(timeout); resolve(); });
    socket.once('match.error', (error: unknown) => { clearTimeout(timeout); reject(new Error(JSON.stringify(error))); });
    socket.emit('match.join', { sessionId });
  });
}
function socketSend(socket: Socket, payload: { sessionId: string; text: string; clientMessageId: string }) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket send timed out')), 3000);
    socket.once('match.sent', (result: { clientMessageId?: string }) => {
      clearTimeout(timeout);
      if (result?.clientMessageId !== payload.clientMessageId) reject(new Error('Socket message failed'));
      else resolve();
    });
    socket.emit('match.send', payload);
  });
}
