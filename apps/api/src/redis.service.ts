import { Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;
  private ready = false;
  constructor() {
    const url = process.env.REDIS_URL;
    if (!url && process.env.NODE_ENV === 'production') throw new Error('REDIS_URL is required');
    this.client = new Redis(url ?? 'redis://127.0.0.1:6389', { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500, retryStrategy: () => null });
    this.client.on('ready', () => { this.ready = true; });
    this.client.on('end', () => { this.ready = false; });
  }
  async onModuleInit() {
    try { await this.client.connect(); this.ready = true; }
    catch { this.ready = false; }
  }
  async onModuleDestroy() { this.client.disconnect(); }

  async allow(key: string, limit: number, windowSeconds: number) {
    if (!this.ready) throw new ServiceUnavailableException('Safety rate limit is unavailable');
    const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
    try {
      const count = await this.client.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
        1,
        `pulse:rate:${key}:${bucket}`,
        String(windowSeconds),
      ) as number;
      return count <= limit;
    } catch {
      this.ready = false;
      throw new ServiceUnavailableException('Safety rate limit is unavailable');
    }
  }
}
