import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return true;
    const origin = request.headers.origin;
    const expected = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
    if (origin && origin !== expected) throw new ForbiddenException('Request origin is not allowed');
    return true;
  }
}
