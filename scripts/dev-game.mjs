import { spawn } from 'node:child_process';

// Dedicated local workflow. Reject remote targets before generating/applying any schema.
if (process.env.NODE_ENV === 'production') throw new Error('dev:game is a local-only command');
let database;
let redis;
try {
  database = new URL(process.env.DATABASE_URL ?? 'postgresql://pulse:pulse_local_only@127.0.0.1:54329/pulse?schema=public');
  redis = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6389');
} catch { throw new Error('Set valid local DATABASE_URL and REDIS_URL values'); }
if (!['postgres:', 'postgresql:'].includes(database.protocol) || database.hostname !== '127.0.0.1' || !['/pulse', '/pulse_local'].includes(database.pathname) || [...database.searchParams.keys()].some(key => key !== 'schema')) throw new Error('dev:game requires 127.0.0.1 and a dedicated pulse or pulse_local database');
if (!['redis:', 'rediss:'].includes(redis.protocol) || redis.hostname !== '127.0.0.1') throw new Error('dev:game requires Redis on 127.0.0.1');
const webPort = Number(process.env.GAME_WEB_PORT ?? 5317);
const apiPort = Number(process.env.GAME_API_PORT ?? 3107);
if (![webPort, apiPort].every(port => Number.isInteger(port) && port > 1024 && port <= 65535) || webPort === apiPort) throw new Error('Choose separate GAME_WEB_PORT/GAME_API_PORT values between 1025 and 65535');
const env = { ...process.env, NODE_ENV: 'development', DATABASE_URL: database.href, REDIS_URL: redis.href, LOCAL_GAME_ENABLED: 'true', DEV_TEST_AUTH_ENABLED: 'false', WEB_ORIGIN: `http://localhost:${webPort}`, PORT: String(apiPort), VITE_API_URL: `http://localhost:${apiPort}/v1` };
const children = new Set();
let stopping = false;
function stop() { stopping = true; for (const child of children) child.kill('SIGTERM'); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
function start(args) {
  const child = spawn('pnpm', args, { env, stdio: 'inherit' });
  children.add(child);
  child.on('error', () => { console.error('Unable to start pnpm. Install the declared project dependencies first.'); process.exitCode = 1; stop(); });
  child.on('exit', () => children.delete(child));
  return child;
}
async function run(args) {
  const child = start(args);
  const code = await new Promise(resolve => child.once('exit', resolve));
  if (code !== 0 || stopping) { stop(); throw new Error('Local preparation failed; game was not launched'); }
}
await run(['--filter', '@pulse/api', 'db:generate']);
await run(['--filter', '@pulse/api', 'exec', 'prisma', 'migrate', 'deploy']);
const api = start(['--filter', '@pulse/api', 'exec', 'ts-node', '--transpile-only', 'src/main.ts']);
const web = start(['--filter', '@pulse/web', 'dev', '--host', '127.0.0.1', '--port', String(webPort)]);
console.log(`PULSE game: http://localhost:${webPort}/ — Ctrl+C stops the local preview.`);
for (const child of [api, web]) child.on('exit', code => { if (!stopping) { process.exitCode = code || 1; stop(); } });
