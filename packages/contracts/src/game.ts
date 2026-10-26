export type GamePhase = 'LOBBY' | 'ANSWER' | 'GUESS' | 'REVEAL' | 'DISCUSSION' | 'FINAL' | 'PAUSED' | 'RESULTS' | 'ENDED';
export type GameAction = 'ready' | 'answer' | 'guess' | 'skip' | 'next' | 'final' | 'rematch' | 'leave' | 'react' | 'extend' | 'here';
export type GameCommand = { commandId: string; gameId: string; roundId: string; expectedVersion: number; action: GameAction; choice?: number; reaction?: string };
export type GameSnapshot = {
  roomId: string; gameId: string; version: number; phase: GamePhase; deadline: number | null; serverNow: number;
  myId: string; pace: 'normal' | 'relaxed'; extended: boolean; endReason: string | null;
  players: { id: string; nickname: string; seat: number; ready: boolean; submitted: boolean; nextReady: boolean; rematchReady: boolean; lastSeenAt: number; needsReturn: boolean }[];
  round: { id: string; number: number; topic: string; prompt: string; options: string[]; followUp: string };
  myChoice: number | null; myGuess: number | null; skipped: boolean;
  reveal: null | { playerId: string; answer: number; guess: number | null; correct: boolean }[];
  scores: { playerId: string; correct: number; opportunities: number }[];
  story: string | null; reactions: { id: string; playerId: string; emoji: string; at: number }[];
  lastCommandIds: string[];
};
