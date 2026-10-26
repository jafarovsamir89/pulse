import { z } from 'zod';
export type { GamePhase, GameAction, GameCommand, GameSnapshot } from './game';

export const languageSchema = z.enum(['ru', 'az', 'en']);
export const queueRequestSchema = z.object({
  language: languageSchema,
  mood: z.enum(['talk', 'quiet', 'play']).optional(),
  idempotencyKey: z.string().uuid(),
}).strict();
export const messageSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  clientMessageId: z.string().uuid(),
}).strict();
export type QueueRequest = z.infer<typeof queueRequestSchema>;
export type ChatMessageInput = z.infer<typeof messageSchema>;
