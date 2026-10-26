import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { RedisService } from '../src/redis.service';
import { requireLocalTestDatabase } from './local-database';
import { RealtimeAccess } from '../src/realtime-access';

process.env.DATABASE_URL = requireLocalTestDatabase(process.env.PULSE_TEST_DATABASE_URL);
process.env.NODE_ENV = 'test';
process.env.DEV_TEST_AUTH_ENABLED = 'true';

describe('T02 private socket delivery and revocation', () => {
  let app: INestApplication;
  let db: PrismaService;
  let address: string;
  const users: string[] = [];
  const offers: string[] = [];
  const sockets: Socket[] = [];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RedisService).useValue({ allow: async () => true }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('v1');
    await app.listen(0, '127.0.0.1');
    address = await app.getUrl();
    db = app.get(PrismaService);
  });
  afterEach(() => { sockets.splice(0).forEach(socket => socket.disconnect()); });
  afterAll(async () => {
    await db.report.deleteMany({ where: { reporterId: { in: users } } });
    await db.matchOffer.deleteMany({ where: { id: { in: offers } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
  });

  async function credential(userId: string, expiresAt = new Date(Date.now() + 60000)) {
    const token = randomUUID();
    const session = await db.authSession.create({ data: {
      userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt,
    } });
    return { cookie: `pulse_session=${token}`, authId: session.id };
  }
  async function identity() {
    const id = `t02-${randomUUID()}`;
    await db.user.create({ data: { id, ageGateStatus: 'VERIFIED' } });
    users.push(id);
    return { id, ...await credential(id) };
  }
  async function fixture() {
    const a = await identity();
    const b = await identity();
    const expiresAt = new Date(Date.now() + 60000);
    const offer = await db.matchOffer.create({ data: { userAId: a.id, userBId: b.id, status: 'ACCEPTED', expiresAt,
      session: { create: { expiresAt, members: { create: [{ userId: a.id }, { userId: b.id }] } } },
    }, include: { session: true } });
    offers.push(offer.id);
    return { a, b, sessionId: offer.session!.id };
  }
  async function joined(cookie: string, sessionId: string) {
    const socket = io(`${address}/chat`, { autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: { cookie } });
    sockets.push(socket);
    const connected = event(socket, 'connect');
    socket.connect();
    await connected;
    const ready = event(socket, 'match.joined');
    socket.emit('match.join', { sessionId });
    await ready;
    return socket;
  }
  function event(socket: Socket, name: string, timeoutMs = 2500) {
    return new Promise<unknown>((resolve, reject) => {
      const listener = (value: unknown) => { clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => { socket.off(name, listener); reject(new Error(`Timed out: ${name}`)); }, timeoutMs);
      socket.once(name, listener);
    });
  }

  it('logout closes all tabs using that token while another valid login keeps receiving', async () => {
    const { a, b, sessionId } = await fixture();
    const alternate = await credential(b.id);
    const [sender, tab1, tab2, otherLogin] = await Promise.all([
      joined(a.cookie, sessionId), joined(b.cookie, sessionId), joined(b.cookie, sessionId), joined(alternate.cookie, sessionId),
    ]);
    const privateEvents = jest.fn();
    [tab1, tab2].forEach(socket => socket.on('match.message', privateEvents));
    const disconnections = Promise.all([event(tab1, 'disconnect'), event(tab2, 'disconnect')]);
    await request(address).post('/v1/auth/logout').set('Cookie', b.cookie).expect(201);
    const received = event(otherLogin, 'match.message');
    sender.emit('match.send', { sessionId, text: 'Only a valid login', clientMessageId: randomUUID() });
    await expect(received).resolves.toMatchObject({ text: 'Only a valid login' });
    await disconnections;
    expect(privateEvents).not.toHaveBeenCalled();
    expect(otherLogin.connected).toBe(true);
  });

  it.each(['revoked', 'expired', 'suspended', 'age-denied'] as const)('rechecks %s receiver state even if invalidation was missed', async reason => {
    const { a, b, sessionId } = await fixture();
    const [sender, receiver] = await Promise.all([joined(a.cookie, sessionId), joined(b.cookie, sessionId)]);
    const privateEvents = jest.fn();
    receiver.on('match.message', privateEvents);
    if (reason === 'revoked') await db.authSession.update({ where: { id: b.authId }, data: { revokedAt: new Date() } });
    if (reason === 'expired') await db.authSession.update({ where: { id: b.authId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    if (reason === 'suspended') await db.user.update({ where: { id: b.id }, data: { status: 'SUSPENDED' } });
    if (reason === 'age-denied') await db.user.update({ where: { id: b.id }, data: { ageGateStatus: 'DENIED' } });
    const disconnected = event(receiver, 'disconnect');
    const sent = event(sender, 'match.sent');
    sender.emit('match.send', { sessionId, text: 'Private after revoke', clientMessageId: randomUUID() });
    await sent;
    await disconnected;
    expect(privateEvents).not.toHaveBeenCalled();
  });

  it('deletion disconnects every login immediately, including idle tabs', async () => {
    const { b, sessionId } = await fixture();
    const alternate = await credential(b.id);
    const [tab1, tab2] = await Promise.all([joined(b.cookie, sessionId), joined(alternate.cookie, sessionId)]);
    const disconnected = Promise.all([event(tab1, 'disconnect'), event(tab2, 'disconnect')]);
    await request(address).delete('/v1/me').set('Cookie', b.cookie).expect(200);
    await disconnected;
  });

  it('moderator suspension disconnects all target logins after its transaction commits', async () => {
    const { a, b, sessionId } = await fixture();
    await db.user.update({ where: { id: a.id }, data: { role: 'MODERATOR' } });
    const report = await db.report.create({ data: { reporterId: a.id, targetUserId: b.id, category: 'other' } });
    const receiver = await joined(b.cookie, sessionId);
    const disconnected = event(receiver, 'disconnect');
    await request(address).post(`/v1/safety/moderation/reports/${report.id}`).set('Cookie', a.cookie).send({ action: 'suspend', reason: 'Synthetic local review' }).expect(201);
    await disconnected;
    expect((await db.user.findUniqueOrThrow({ where: { id: b.id } })).status).toBe('SUSPENDED');
  });

  it('disconnects an idle connection at its authentication expiry', async () => {
    const { b, sessionId } = await fixture();
    const short = await credential(b.id, new Date(Date.now() + 700));
    const receiver = await joined(short.cookie, sessionId);
    await event(receiver, 'disconnect');
    expect(receiver.connected).toBe(false);
  });

  it('waits for an in-flight revocation commit and then drops the private delivery', async () => {
    const { a, b, sessionId } = await fixture();
    const [sender, receiver] = await Promise.all([joined(a.cookie, sessionId), joined(b.cookie, sessionId)]);
    const privateEvents = jest.fn();
    receiver.on('match.message', privateEvents);
    let signalLocked!: (pid: number) => void;
    let release!: () => void;
    const locked = new Promise<number>(resolve => { signalLocked = resolve; });
    const canCommit = new Promise<void>(resolve => { release = resolve; });
    const revocation = db.$transaction(async tx => {
      const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      await tx.authSession.update({ where: { id: b.authId }, data: { revokedAt: new Date() } });
      signalLocked(backend.pid);
      await canCommit;
    }, { timeout: 10000 });
    try {
      const pid = await locked;
      // Publish directly so the test controls delivery, independently of the send/ACK protocol.
      const delivery = app.get(RealtimeAccess).publish(sessionId, 'match.message', { text: 'Concurrent private event' });
      const deadline = Date.now() + 2000;
      let waiting = false;
      while (Date.now() < deadline) {
        const [state] = await db.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))) AS waiting
        `;
        if (state.waiting) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      const disconnected = event(receiver, 'disconnect');
      release();
      await revocation;
      await delivery;
      await disconnected;
      expect(privateEvents).not.toHaveBeenCalled();
      expect(sender.connected).toBe(true);
    } finally { release(); await revocation; }
  });

  it('fails closed when database authorization cannot be checked', async () => {
    const { b, sessionId } = await fixture();
    const receiver = await joined(b.cookie, sessionId);
    const privateEvents = jest.fn();
    receiver.on('match.message', privateEvents);
    const disconnected = event(receiver, 'disconnect');
    const transaction = jest.spyOn(db, '$transaction').mockRejectedValue(new Error('Synthetic authorization DB failure'));
    try {
      await app.get(RealtimeAccess).publish(sessionId, 'match.message', { text: 'Must not escape' });
      await disconnected;
      expect(privateEvents).not.toHaveBeenCalled();
    } finally { transaction.mockRestore(); }
  });

  it('also filters closure events for a revoked receiver', async () => {
    const { a, b, sessionId } = await fixture();
    const [sender, receiver] = await Promise.all([joined(a.cookie, sessionId), joined(b.cookie, sessionId)]);
    const privateEvents = jest.fn();
    receiver.on('match.closed', privateEvents);
    await db.authSession.update({ where: { id: b.authId }, data: { revokedAt: new Date() } });
    const closed = event(sender, 'match.closed');
    const disconnected = event(receiver, 'disconnect');
    await request(address).post(`/v1/text-match/sessions/${sessionId}/leave`).set('Cookie', a.cookie).expect(201);
    await expect(closed).resolves.toMatchObject({ sessionId, reason: 'ended' });
    await disconnected;
    expect(privateEvents).not.toHaveBeenCalled();
  });
});
