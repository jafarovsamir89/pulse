export type RuntimeMode = 'development' | 'test' | 'production';
export interface RuntimeConfig {
  mode: RuntimeMode;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  webOrigin: string;
  devTestAuthEnabled: boolean;
}

export function validateConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const rawMode = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(rawMode)) throw new Error('NODE_ENV must be development, test or production');
  const mode = rawMode as RuntimeMode;
  const databaseUrl = env.DATABASE_URL ?? '';
  const redisUrl = env.REDIS_URL ?? '';
  const webOrigin = env.WEB_ORIGIN ?? (mode === 'production' ? '' : 'http://localhost:5173');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) throw new Error('DATABASE_URL must point to PostgreSQL');
  if (!redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) throw new Error('REDIS_URL must point to Redis');
  if (!webOrigin.startsWith('http://') && !webOrigin.startsWith('https://')) throw new Error('WEB_ORIGIN must be an absolute HTTP(S) origin');
  const devTestAuthEnabled = env.DEV_TEST_AUTH_ENABLED === 'true';
  if (mode === 'production' && devTestAuthEnabled) throw new Error('Development test identities cannot be enabled in production');
  if (mode === 'production' && webOrigin.startsWith('http://')) throw new Error('Production WEB_ORIGIN must use HTTPS');
  return Object.freeze({ mode, port, databaseUrl, redisUrl, webOrigin, devTestAuthEnabled });
}
