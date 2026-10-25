import { validateConfig } from '../src/config';

const valid = {
  NODE_ENV: 'production',
  PORT: '443',
  DATABASE_URL: 'postgresql://db.example/pulse',
  REDIS_URL: 'rediss://redis.example:6380',
  WEB_ORIGIN: 'https://pulse.example',
  DEV_TEST_AUTH_ENABLED: 'false',
};

describe('runtime configuration', () => {
  it('accepts production config only with TLS origin and dev auth off', () => {
    expect(validateConfig(valid)).toMatchObject({ mode: 'production', port: 443, devTestAuthEnabled: false });
    expect(() => validateConfig({ ...valid, DEV_TEST_AUTH_ENABLED: 'true' })).toThrow(/cannot be enabled/);
    expect(() => validateConfig({ ...valid, WEB_ORIGIN: 'http://pulse.example' })).toThrow(/HTTPS/);
  });
  it('rejects invalid port and non-local protocols', () => {
    expect(() => validateConfig({ ...valid, PORT: '70000' })).toThrow(/PORT/);
    expect(() => validateConfig({ ...valid, REDIS_URL: 'https://redis.example' })).toThrow(/REDIS_URL/);
  });
});
