import { requireLocalTestDatabase } from './local-database';

describe('destructive integration test database boundary', () => {
  it.each([
    undefined,
    'postgresql://127.0.0.1@remote.example/pulse_test',
    'postgresql://remote.example/pulse_test?schema=127.0.0.1',
    'postgresql://127.0.0.1/pulse',
    'postgresql://127.0.0.1/pulse_test?host=remote.example',
    'https://127.0.0.1/pulse_test',
  ])('rejects unsafe target %s', value => {
    expect(() => requireLocalTestDatabase(value)).toThrow();
  });
  it('accepts the explicit loopback test database', () => {
    const value = 'postgresql://local@127.0.0.1:55479/pulse_test?schema=public';
    expect(requireLocalTestDatabase(value)).toBe(value);
  });
});
