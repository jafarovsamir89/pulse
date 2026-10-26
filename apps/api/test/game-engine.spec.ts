import { randomUUID } from 'node:crypto';
import { applyCommand, createGame, GameRuleError, snapshot, tick, type GameState, type Player } from '../src/game/engine';
import type { GameAction, GameCommand } from '@pulse/contracts';

const players = (): Player[] => ['one', 'two'].map(id => ({ id, nickname: id, tokenHash: `hash-${id}`, ready: false, lastSeenAt: 1000, idle: 0, rematch: false }));
function play(state: GameState, id: string, action: GameAction, choice?: number, now = 1000) {
  const command: GameCommand = { commandId: randomUUID(), gameId: state.gameId, roundId: `${state.gameId}:${state.roundIndex}`, expectedVersion: state.version, action, ...(choice === undefined ? {} : { choice }) };
  applyCommand(state, id, command, now);
}
function start() { const state = createGame(players(), 'normal'); play(state, 'one', 'ready'); play(state, 'two', 'ready'); return state; }
describe('G1 server state machine', () => {
  it('keeps answers, guesses and future cards off the other player projection until reveal', () => {
    const state = start();
    play(state, 'one', 'answer', 1);
    const peer = snapshot('room', state, 'two', 1000);
    expect(peer.myChoice).toBeNull(); expect(peer.reveal).toBeNull();
    expect(JSON.stringify(peer)).not.toMatch(/tokenHash|hash-one|cardId|receipts/);
    play(state, 'two', 'answer', 0); play(state, 'one', 'guess', 0);
    expect(snapshot('room', state, 'two', 1000).myGuess).toBeNull();
    expect(snapshot('room', state, 'one', 1000).scores[0].correct).toBe(0);
    play(state, 'two', 'guess', 1);
    expect(state.phase).toBe('REVEAL');
    expect(snapshot('room', state, 'one', 1000).scores.map(s => s.correct)).toEqual([1, 1]);
  });
  it('never fabricates a missing answer; two missed turns pause, then end honestly', () => {
    const state = start();
    tick(state, 21000); expect(state.phase).toBe('REVEAL'); expect(state.rounds[0].skipped).toBe(true);
    expect(snapshot('room', state, 'one', 21000).reveal).toBeNull();
    tick(state, 24000); play(state, 'one', 'next', undefined, 24000); play(state, 'two', 'next', undefined, 24000);
    tick(state, 44000); expect(state.phase).toBe('PAUSED');
    tick(state, 74000); expect(state.phase).toBe('ENDED');
    expect(state.roundIndex).toBe(1);
  });
  it('withdraws both secrets on an explicit skip without scoring', () => {
    const state = start(); play(state, 'one', 'answer', 1); play(state, 'two', 'answer', 0);
    play(state, 'one', 'guess', 0); play(state, 'two', 'skip');
    expect(state.rounds[0].answers).toEqual([null, null]);
    expect(snapshot('room', state, 'one', 1000).reveal).toBeNull();
    expect(snapshot('room', state, 'one', 1000).scores[0].opportunities).toBe(0);
  });
  it('locks a submitted answer and prevents phase/option spoofing', () => {
    const state = start(); play(state, 'one', 'answer', 1);
    expect(() => play(state, 'one', 'answer', 0)).toThrow(GameRuleError);
    expect(() => play(state, 'two', 'guess', 0)).toThrow(GameRuleError);
    expect(() => play(state, 'two', 'answer', 2)).toThrow(GameRuleError);
  });
  it('extends once, honors relaxed timing, and permits exit during every phase', () => {
    const state = createGame(players(), 'relaxed'); play(state, 'one', 'ready'); play(state, 'two', 'ready');
    expect(state.deadline).toBe(41000); play(state, 'one', 'extend'); expect(state.deadline).toBe(56000);
    expect(() => play(state, 'two', 'extend')).toThrow(GameRuleError);
    play(state, 'two', 'leave'); expect(state.phase).toBe('ENDED');
  });
});
