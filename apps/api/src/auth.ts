import { createHash, randomBytes } from 'node:crypto';
import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Injectable, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PrismaService } from './prisma.service';

export type AuthedRequest = Request & { userId?: string };
const COOKIE = 'pulse_session';
class DevSessionDto { @IsIn(['test-adult-a', 'test-adult-b']) identity!: 'test-adult-a' | 'test-adult-b'; }

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService) {}

  async issueDevSession(identity: unknown) {
    if (process.env.NODE_ENV === 'production' || process.env.DEV_TEST_AUTH_ENABLED !== 'true') {
      throw new ForbiddenException('Development test login is disabled');
    }
    if (identity !== 'test-adult-a' && identity !== 'test-adult-b') throw new UnauthorizedException('Unknown local test identity');
    const user = await this.db.user.upsert({
      where: { id: identity },
      update: {},
      create: { id: identity, ageGateStatus: 'VERIFIED' },
      include: { profile: true },
    });
    if (user.status !== 'ACTIVE' || user.ageGateStatus !== 'VERIFIED') throw new ForbiddenException('Account is not eligible');
    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.db.authSession.create({ data: { userId: user.id, tokenHash: this.hash(rawToken), expiresAt } });
    return { rawToken, expiresAt, profile: user.profile };
  }

  async resolve(rawToken: string | undefined) {
    if (!rawToken) return null;
    const session = await this.db.authSession.findUnique({ where: { tokenHash: this.hash(rawToken) }, include: { user: { include: { profile: true } } } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
    if (session.user.status !== 'ACTIVE' || session.user.ageGateStatus !== 'VERIFIED') return null;
    return session.user;
  }

  async revoke(rawToken: string | undefined) {
    if (!rawToken) return;
    await this.db.authSession.updateMany({ where: { tokenHash: this.hash(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  token(req: Request) {
    const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE}=`));
    const cookieValue = cookie?.slice(COOKIE.length + 1);
    const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    return cookieValue || bearer;
  }
  private hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.auth.resolve(this.auth.token(req));
    if (!user) throw new UnauthorizedException('A verified active account is required');
    req.userId = user.id;
    return true;
  }
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('dev-session')
  async createDevSession(@Body() body: DevSessionDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.issueDevSession(body.identity);
    res.cookie(COOKIE, result.rawToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', expires: result.expiresAt });
    return { profile: result.profile, expiresAt: result.expiresAt };
  }

  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.revoke(this.auth.token(req));
    res.clearCookie(COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
    return { ok: true };
  }
}
