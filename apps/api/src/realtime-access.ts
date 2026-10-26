import { createHash } from 'node:crypto';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Socket } from 'socket.io';
import { PrismaService } from './prisma.service';

export const sessionTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
type Identity = { userId: string; tokenHash: string; expiresAt: Date };
type Connection = Identity & { client: Socket; timer: ReturnType<typeof setTimeout> };

@Injectable()
export class RealtimeAccess implements OnModuleDestroy {
  private readonly connections = new Map<string, Connection>();
  constructor(private readonly db: PrismaService) {}

  async connect(client: Socket, token: string | undefined) {
    try {
      const allowed = await this.withIdentity(token ? sessionTokenHash(token) : undefined, async (_tx, identity) => {
        if (!client.connected || identity.expiresAt.getTime() <= Date.now()) return false;
        client.data.userId = identity.userId;
        this.track(client, identity);
        return true;
      });
      if (!allowed) client.disconnect(true);
    } catch { client.disconnect(true); }
  }

  private track(client: Socket, identity: Identity) {
    this.forget(client);
    // Node timers cap at 2^31-1 ms. Re-arm rather than expiring a long-lived token early.
    const expire = () => {
      const remaining = identity.expiresAt.getTime() - Date.now();
      if (remaining <= 0) { client.disconnect(true); return; }
      const timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
      timer.unref();
      this.connections.set(client.id, { ...identity, client, timer });
    };
    expire();
  }

  forget(client: Socket) {
    const connection = this.connections.get(client.id);
    if (connection) clearTimeout(connection.timer);
    this.connections.delete(client.id);
  }
  revokeToken(tokenHash: string) {
    for (const connection of this.connections.values()) {
      if (connection.tokenHash === tokenHash) connection.client.disconnect(true);
    }
  }
  revokeUser(userId: string) {
    for (const connection of this.connections.values()) {
      if (connection.userId === userId) connection.client.disconnect(true);
    }
  }
  onModuleDestroy() {
    for (const connection of this.connections.values()) clearTimeout(connection.timer);
    this.connections.clear();
  }

  async publish(sessionId: string, event: string, payload: unknown, activeOnly = true) {
    const recipients = [...this.connections.values()].filter(({ client }) => client.rooms.has(`session:${sessionId}`));
    await Promise.all(recipients.map(async ({ client, tokenHash }) => {
      try {
        const allowed = await this.withIdentity(tokenHash, async (tx, identity) => {
          // Match leave locks its member before its session; keep the same order here.
          const [member] = await tx.$queryRaw<{ id: string }[]>`
            SELECT m.id FROM "MatchMember" m
            WHERE m."sessionId" = ${sessionId} AND m."userId" = ${identity.userId}
              AND (${!activeOnly} OR m."leftAt" IS NULL)
            FOR SHARE OF m
          `;
          if (!member) return false;
          const [membership] = await tx.$queryRaw<{ userAId: string; userBId: string; expiresAt: Date }[]>`
            SELECT o."userAId", o."userBId", s."expiresAt"
            FROM "MatchSession" s
            JOIN "MatchOffer" o ON o.id = s."offerId"
            WHERE s.id = ${sessionId}
              AND (${!activeOnly} OR (s.status = 'ACTIVE' AND s."expiresAt" > clock_timestamp()))
            FOR SHARE OF s
          `;
          if (!membership) return false;
          if (activeOnly && await tx.userBlock.findFirst({ where: { OR: [
            { blockerId: membership.userAId, blockedId: membership.userBId },
            { blockerId: membership.userBId, blockedId: membership.userAId },
          ] }, select: { id: true } })) return false;
          if (!client.connected || identity.expiresAt.getTime() <= Date.now() || (activeOnly && membership.expiresAt.getTime() <= Date.now())) return false;
          // No await between the final checks and emit. Locks remain held through enqueueing.
          client.emit(event, payload);
          return true;
        });
        if (!allowed) client.disconnect(true);
      } catch { client.disconnect(true); } // Fail closed if the source of authorization is unavailable.
    }));
  }

  private async withIdentity(tokenHash: string | undefined, action: (tx: Prisma.TransactionClient, identity: Identity) => Promise<boolean>) {
    if (!tokenHash) return false;
    return this.db.$transaction(async tx => {
      // Lock in the same order as deletion/suspension: user, then authentication session.
      // An emit under these read locks precedes a concurrent revocation commit, or sees its result.
      const [user] = await tx.$queryRaw<{ id: string }[]>`
        SELECT u.id FROM "User" u JOIN "AuthSession" a ON a."userId" = u.id
        WHERE a."tokenHash" = ${tokenHash} AND u.status = 'ACTIVE' AND u."ageGateStatus" = 'VERIFIED'
        FOR SHARE OF u
      `;
      if (!user) return false;
      const [auth] = await tx.$queryRaw<{ expiresAt: Date }[]>`
        SELECT a."expiresAt" FROM "AuthSession" a
        WHERE a."tokenHash" = ${tokenHash} AND a."userId" = ${user.id}
          AND a."revokedAt" IS NULL AND a."expiresAt" > clock_timestamp()
        FOR SHARE OF a
      `;
      if (!auth) return false;
      return action(tx, { userId: user.id, tokenHash, expiresAt: auth.expiresAt });
    }, { maxWait: 2000, timeout: 5000 });
  }
}
