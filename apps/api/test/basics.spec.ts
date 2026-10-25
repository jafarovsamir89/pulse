import { messageSchema, queueRequestSchema } from '../../../packages/contracts/src/index';

describe('shared request contracts', () => {
  it('requires a UUID idempotency key and supported language for queue joins', () => {
    expect(queueRequestSchema.safeParse({ language: 'ru', idempotencyKey: 'not-a-uuid' }).success).toBe(false);
    expect(queueRequestSchema.safeParse({ language: 'xx', idempotencyKey: crypto.randomUUID() }).success).toBe(false);
    expect(queueRequestSchema.safeParse({ language: 'az', idempotencyKey: crypto.randomUUID() }).success).toBe(true);
  });
  it('trims, bounds and rejects unexpected message fields', () => {
    expect(messageSchema.safeParse({ text: '  hello  ', clientMessageId: crypto.randomUUID() }).data?.text).toBe('hello');
    expect(messageSchema.safeParse({ text: 'x'.repeat(1001), clientMessageId: crypto.randomUUID() }).success).toBe(false);
    expect(messageSchema.safeParse({ text: 'hello', clientMessageId: crypto.randomUUID(), authorId: 'spoof' }).success).toBe(false);
  });
});
