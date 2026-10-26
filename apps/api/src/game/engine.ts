import { randomInt, randomUUID } from 'node:crypto';
import type { GameCommand, GamePhase, GameSnapshot } from '@pulse/contracts';
import { CARDS, FINAL_OPTIONS } from './cards';

export class GameRuleError extends Error {}
export type Player = { id: string; nickname: string; tokenHash: string; ready: boolean; lastSeenAt: number; idle: number; rematch: boolean };
type Round = { cardId: string; answers: (number | null)[]; guesses: (number | null)[]; skipped: boolean; next: boolean[] };
export type GameState = {
  gameId: string; version: number; phase: GamePhase; deadline: number | null; pace: 'normal' | 'relaxed'; extended: boolean;
  players: Player[]; roundIndex: number; rounds: Round[]; final: (number | null)[]; story: string | null; endReason: string | null;
  reactions: { id: string; playerId: string; emoji: string; at: number }[];
  receipts: { key: string; fingerprint: string }[];
};
const shuffled = <T>(values: T[]) => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};
export function createGame(players: Player[], pace: 'normal' | 'relaxed', previous: string[] = []): GameState {
  const pick = (size: number, count: number) => {
    const pool = CARDS.filter(card => card.options.length === size);
    return [...shuffled(pool.filter(card => !previous.includes(card.id))), ...shuffled(pool.filter(card => previous.includes(card.id)))].slice(0, count);
  };
  return {
    gameId: randomUUID(), version: 0, phase: 'LOBBY', deadline: null, pace, extended: false, players,
    roundIndex: 0, rounds: [...pick(2, 2), ...pick(3, 4)].map(card => ({ cardId: card.id, answers: [null, null], guesses: [null, null], skipped: false, next: [false, false] })),
    final: [null, null], story: null, endReason: null, reactions: [], receipts: [],
  };
}
function enter(state: GameState, phase: GamePhase, now: number) {
  state.phase = phase; state.extended = false;
  const seconds: Partial<Record<GamePhase, number>> = { ANSWER: state.pace === 'relaxed' ? 40 : 20, GUESS: state.pace === 'relaxed' ? 30 : 15, REVEAL: 3, DISCUSSION: 20, FINAL: 40, PAUSED: 30 };
  state.deadline = seconds[phase] ? now + seconds[phase]! * 1000 : null;
  state.version++;
}
function advanceRound(state: GameState, now: number) {
  state.roundIndex++;
  enter(state, state.roundIndex === 6 ? 'FINAL' : 'ANSWER', now);
}
function reveal(state: GameState, now: number) {
  const round = state.rounds[state.roundIndex];
  if (round.answers.some(answer => answer === null)) round.skipped = true;
  enter(state, 'REVEAL', now);
}
function finishStory(state: GameState) {
  state.story = state.final.every(value => value !== null)
    ? `Наш план: открыть ${FINAL_OPTIONS[0][state.final[0]!]}, а с собой взять ${FINAL_OPTIONS[1][state.final[1]!]}. Вход — по хорошему настроению. Всё остальное придумаем по дороге.`
    : 'У этой истории открытый финал. Самое интересное можно придумать в следующей партии.';
}
export function tick(state: GameState, now: number) {
  // Use the actual transition instant; an absent pair never races through fictitious rounds.
  if (state.deadline === null || now < state.deadline) return;
  if (state.phase === 'PAUSED') { state.endReason = 'Игрок не вернулся. Встреча спокойно завершена.'; enter(state, 'ENDED', now); return; }
  if (state.phase === 'ANSWER' || state.phase === 'GUESS') {
    const round = state.rounds[state.roundIndex];
    const values = state.phase === 'ANSWER' ? round.answers : round.guesses;
    state.players.forEach((player, i) => { if (values[i] === null) player.idle++; });
    if (state.players.some(player => player.idle >= 2)) {
      round.skipped = true; enter(state, 'PAUSED', now); return;
    }
    reveal(state, now); return;
  }
  if (state.phase === 'REVEAL') enter(state, 'DISCUSSION', now);
  else if (state.phase === 'DISCUSSION') advanceRound(state, now);
  else if (state.phase === 'FINAL') { finishStory(state); enter(state, 'RESULTS', now); }
}

export function applyCommand(state: GameState, playerId: string, command: GameCommand, now: number) {
  const seat = state.players.findIndex(player => player.id === playerId);
  if (seat < 0) throw new GameRuleError('Участник не найден');
  const player = state.players[seat];
  if (command.action === 'leave') { state.endReason = 'На сегодня всё. Спасибо за игру!'; enter(state, 'ENDED', now); return; }
  if (state.phase === 'ENDED') throw new GameRuleError('Эта встреча уже завершена');
  if (command.action === 'react') {
    if (!['✨', '😂', '🤝', '😮', '💛'].includes(command.reaction ?? '')) throw new GameRuleError('Неизвестная реакция');
    if (state.reactions.some(r => r.playerId === playerId && now - r.at < 1200)) throw new GameRuleError('Секундочку — реакция уже летит');
    state.reactions = [...state.reactions.filter(r => now - r.at < 8000), { id: command.commandId, playerId, emoji: command.reaction!, at: now }].slice(-10);
    state.version++; return;
  }
  if (command.action === 'extend' && ['ANSWER', 'GUESS', 'FINAL'].includes(state.phase)) {
    if (state.extended || state.deadline === null) throw new GameRuleError('Время уже продлено');
    state.extended = true; state.deadline += 15000; state.version++; return;
  }
  if (state.phase === 'LOBBY' && command.action === 'ready') {
    if (state.players.length !== 2) throw new GameRuleError('Сначала дождёмся второго участника');
    player.ready = true; state.version++;
    if (state.players.every(p => p.ready)) enter(state, 'ANSWER', now);
    return;
  }
  if (state.phase === 'PAUSED' && command.action === 'here') {
    player.idle = 0; state.version++;
    if (state.players.every(p => p.idle < 2)) reveal(state, now);
    return;
  }
  if (state.phase === 'RESULTS' && command.action === 'rematch') {
    player.rematch = true; state.version++;
    if (state.players.every(p => p.rematch)) {
      const next = createGame(state.players.map(p => ({ ...p, ready: true, idle: 0, rematch: false })), state.pace, state.rounds.map(r => r.cardId));
      next.version = state.version; next.receipts = state.receipts;
      Object.assign(state, next); enter(state, 'ANSWER', now);
    }
    return;
  }
  if (state.phase === 'FINAL') {
    if (command.action === 'skip') { finishStory(state); enter(state, 'RESULTS', now); return; }
    if (command.action !== 'final' || state.final[seat] !== null || !Number.isInteger(command.choice) || command.choice! < 0 || command.choice! > 2) throw new GameRuleError('Выбери один вариант финала');
    state.final[seat] = command.choice!; state.version++;
    if (state.final.every(choice => choice !== null)) { finishStory(state); enter(state, 'RESULTS', now); }
    return;
  }
  const round = state.rounds[state.roundIndex];
  if (command.action === 'skip' && ['ANSWER', 'GUESS'].includes(state.phase)) {
    round.answers = [null, null]; round.guesses = [null, null]; round.skipped = true; enter(state, 'REVEAL', now); return;
  }
  if (state.phase === 'DISCUSSION' && command.action === 'next') {
    round.next[seat] = true; state.version++;
    if (round.next.every(Boolean)) advanceRound(state, now);
    return;
  }
  const target = state.phase === 'ANSWER' && command.action === 'answer' ? round.answers : state.phase === 'GUESS' && command.action === 'guess' ? round.guesses : null;
  const card = CARDS.find(c => c.id === round.cardId)!;
  if (!target || target[seat] !== null || !Number.isInteger(command.choice) || command.choice! < 0 || command.choice! >= card.options.length) throw new GameRuleError('Этот ход уже закрыт. Обновляем состояние.');
  target[seat] = command.choice!; player.idle = 0; state.version++;
  if (target.every(value => value !== null)) {
    if (state.phase === 'ANSWER') enter(state, 'GUESS', now);
    else reveal(state, now);
  }
}

export function snapshot(roomId: string, state: GameState, playerId: string, now: number): GameSnapshot {
  const seat = state.players.findIndex(p => p.id === playerId);
  const round = state.rounds[Math.min(state.roundIndex, 5)];
  const card = CARDS.find(c => c.id === round.cardId)!;
  const showing = ['REVEAL', 'DISCUSSION'].includes(state.phase);
  const scores = state.players.map((p, i) => {
    const visible = state.rounds.filter((r, index) => !r.skipped && (index < state.roundIndex || (index === state.roundIndex && showing)));
    return { playerId: p.id, correct: visible.filter(r => r.guesses[i] !== null && r.guesses[i] === r.answers[1 - i]).length, opportunities: visible.filter(r => r.guesses[i] !== null && r.answers[1 - i] !== null).length };
  });
  return {
    roomId, gameId: state.gameId, version: state.version, phase: state.phase, deadline: state.deadline, serverNow: now, myId: playerId,
    pace: state.pace, extended: state.extended, endReason: state.endReason,
    players: state.players.map((p, i) => ({ id: p.id, nickname: p.nickname, seat: i, ready: p.ready, lastSeenAt: p.lastSeenAt, nextReady: round.next[i], rematchReady: p.rematch, needsReturn: p.idle >= 2,
      submitted: state.phase === 'ANSWER' ? round.answers[i] !== null : state.phase === 'GUESS' ? round.guesses[i] !== null : state.phase === 'FINAL' ? state.final[i] !== null : false })),
    round: state.roundIndex === 6 ? { id: `${state.gameId}:6`, number: 7, topic: 'Наш маленький план', prompt: seat === 0 ? 'Где устроим нашу вымышленную встречу?' : 'Что обязательно возьмём с собой?', options: FINAL_OPTIONS[seat], followUp: 'Один выбирает место, другой — необычный предмет. Вместе получится история.' }
      : { id: `${state.gameId}:${state.roundIndex}`, number: state.roundIndex + 1, topic: card.topic, prompt: card.prompt, options: card.options, followUp: card.followUp },
    myChoice: state.roundIndex === 6 ? state.final[seat] : round.answers[seat], myGuess: round.guesses[seat], skipped: round.skipped,
    reveal: showing && !round.skipped ? state.players.map((p, i) => ({ playerId: p.id, answer: round.answers[i]!, guess: round.guesses[i], correct: round.guesses[i] !== null && round.guesses[i] === round.answers[1 - i] })) : null,
    scores, story: state.phase === 'RESULTS' ? state.story : null,
    reactions: state.reactions.filter(r => now - r.at < 8000),
    lastCommandIds: state.receipts.filter(r => r.key.startsWith(`${playerId}:`)).slice(-12).map(r => r.key.slice(playerId.length + 1)),
  };
}
