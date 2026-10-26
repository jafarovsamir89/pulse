export function requireLocalTestDatabase(value: string | undefined): string {
  if (!value) throw new Error('PULSE_TEST_DATABASE_URL is required');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.pathname !== '/pulse_test' || [...url.searchParams.keys()].some(key => key !== 'schema')) {
    throw new Error('Tests require the dedicated pulse_test database on 127.0.0.1');
  }
  return value;
}
