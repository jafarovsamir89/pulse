import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { GameAction, GameCommand, GameSnapshot } from '@pulse/contracts';
import './game.css';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/v1';
const storageKey = (room: string) => `pulse:g1:${room}`;
class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function api<T>(path: string, token?: string, body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`${API}/local-game/rooms${path}`, { method: body ? 'POST' : 'GET', credentials: 'omit', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new ApiError('Связь прервалась. Проверь соединение и попробуй ещё раз.', 0); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(Array.isArray(result.message) ? result.message[0] : result.message ?? 'Не получилось отправить ход', response.status);
  return result as T;
}
function Orbit({ small = false }: { small?: boolean }) {
  return <div className={`duet-art ${small ? 'small' : ''}`} aria-hidden="true"><div className="orbit-ring"/><div className="art-star star-one">✦</div><div className="art-star star-two">✧</div><div className="art-face face-mint"><i/><i/><b/></div><div className="art-face face-purple"><i/><i/><b/></div><span className="art-bubble">а ты как?</span></div>;
}
function Brand() { return <a className="game-brand" href="/" aria-label="PULSE — на главную"><span>✳</span>PULSE<span className="brand-note">play a little. feel a little.</span></a>; }
const REACTIONS = ['✨', '😂', '🤝', '😮', '💛'];

export default function App() {
  const initialRoom = new URLSearchParams(window.location.search).get('room') ?? '';
  const [roomId, setRoomId] = useState(initialRoom);
  const [token, setToken] = useState(() => initialRoom ? sessionStorage.getItem(storageKey(initialRoom)) ?? '' : '');
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const latest = useRef<GameSnapshot | null>(null);
  const [nickname, setNickname] = useState('');
  const [adult, setAdult] = useState(false);
  const [pace, setPace] = useState<'normal' | 'relaxed'>('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const exitDialog = useRef<HTMLElement | null>(null);
  const [pending, setPending] = useState<GameCommand | null>(null);
  const serverOffset = useRef(0);
  const apply = useCallback((snapshot: GameSnapshot) => {
    if (!latest.current || snapshot.version >= latest.current.version) {
      latest.current = snapshot; setGame(snapshot); serverOffset.current = snapshot.serverNow - Date.now();
    }
  }, []);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 250); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!leaveConfirm) return;
    const previous = document.activeElement as HTMLElement | null;
    const buttons = exitDialog.current?.querySelectorAll<HTMLButtonElement>('button');
    buttons?.[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLeaveConfirm(false);
      if (event.key === 'Tab' && buttons?.length) {
        const first = buttons[0]!; const last = buttons[buttons.length - 1]!;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [leaveConfirm]);
  useEffect(() => {
    if (!roomId || !token) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const snapshot = await api<GameSnapshot>(`/${roomId}`, token);
        if (stopped) return;
        apply(snapshot); setOffline(false);
      } catch (cause) {
        if (stopped) return;
        const failure = cause as ApiError;
        if ([403, 404].includes(failure.status)) { setError(failure.message); setToken(''); sessionStorage.removeItem(storageKey(roomId)); }
        else setOffline(true);
      }
      if (!stopped) timer = setTimeout(poll, document.hidden ? 1400 : 550);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [roomId, token, apply]);
  useEffect(() => {
    if (pending && game?.lastCommandIds.includes(pending.commandId)) { setPending(null); setError(''); }
  }, [game, pending]);

  async function enter(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ token: string; snapshot: GameSnapshot }>(roomId ? `/${roomId}/join` : '', undefined, { nickname: nickname.trim(), adult, pace });
      sessionStorage.setItem(storageKey(result.snapshot.roomId), result.token);
      setRoomId(result.snapshot.roomId); setToken(result.token); apply(result.snapshot);
      window.history.replaceState({}, '', `?room=${result.snapshot.roomId}`);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function send(action: GameAction, extra: { choice?: number; reaction?: string } = {}, retry?: GameCommand) {
    const current = latest.current;
    if (!current || busy) return;
    const command: GameCommand = retry ?? { commandId: crypto.randomUUID(), gameId: current.gameId, roundId: current.round.id, expectedVersion: current.version, action, ...extra };
    setBusy(true); setError(''); setPending(command);
    try {
      let result: GameSnapshot;
      try { result = await api<GameSnapshot>(`/${roomId}/commands`, token, command); }
      catch (cause) {
        if (!(cause instanceof ApiError) || cause.status !== 409) throw cause;
        const fresh = await api<GameSnapshot>(`/${roomId}`, token); apply(fresh);
        if (!fresh.lastCommandIds.includes(command.commandId) && (fresh.gameId !== command.gameId || fresh.round.id !== command.roundId)) throw new ApiError('Раунд уже сменился. Продолжаем с новой карточкой.', 400);
        result = await api<GameSnapshot>(`/${roomId}/commands`, token, { ...command, expectedVersion: fresh.version });
      }
      apply(result); setPending(null); setOffline(false);
    } catch (cause) {
      const failure = cause as ApiError;
      setError(failure.message);
      if (failure.status !== 0 && failure.status < 500) setPending(null);
    } finally { setBusy(false); }
  }
  const me = game?.players.find(p => p.id === game.myId);
  const peer = game?.players.find(p => p.id !== game.myId);
  const now = clock + serverOffset.current;
  const seconds = game?.deadline ? Math.max(0, Math.ceil((game.deadline - now) / 1000)) : null;
  const invite = `${window.location.origin}/?room=${roomId}`;
  const disabled = busy || offline || Boolean(pending);
  const act = (action: GameAction, extra = {}) => void send(action, extra);
  async function copyLink() {
    try { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 2200); }
    catch { setError('Скопируй ссылку из поля приглашения.'); }
  }
  function feedback() {
    return <>{offline && <div className="game-notice" role="status">Восстанавливаем связь. Твои принятые ходы сохранены.</div>}{error && <div className="game-error" role="alert">{error}{pending && !busy && <button onClick={() => void send(pending.action, {}, pending)}>Повторить отправку</button>}</div>}</>;
  }
  if (!token || !game || !me) return <div className="game-app"><header className="game-topbar"><Brand/><span className="local-label">ЛОКАЛЬНАЯ ИГРА · 18+</span></header>
    <main className="welcome-layout"><section className="welcome-copy"><div className="overline"><span className="live-dot"/> ОДНА КОМНАТА. ДВОЕ. МАЛЕНЬКОЕ ПРИКЛЮЧЕНИЕ.</div><h1>А ты бы<br/><em>что выбрал?</em></h1><p className="hero-copy">Шесть неожиданных вопросов. Один общий финал.<br/>Угадывайте друг друга — и находите поводы улыбнуться.</p><Orbit/><div className="how-it-works"><span><b>01</b> Выбери за себя</span><span><b>02</b> Угадай другого</span><span><b>03</b> Удивись вместе</span></div></section>
    <section className="entry-card"><span className="mini-tag">УГАДАЙ МЕНЯ <i>✦</i></span><h2>{roomId ? 'Тебя пригласили поиграть' : 'Хороший вечер начинается с «давай»'}</h2><p>{roomId ? 'В комнате будет только двое. Осталось представиться и зайти.' : 'Создай комнату и отправь ссылку человеку, с которым хочется провести немного времени.'}</p>
    {token && !game ? <div className="loading-state" role="status"><span className="pulse-loader"/> Возвращаемся в комнату…</div> : <form onSubmit={event => void enter(event)}><label className="field-label" htmlFor="nickname">Как тебя называть?</label><input id="nickname" name="nickname" autoComplete="nickname" placeholder="Твоё имя или ник" maxLength={24} value={nickname} onChange={event => setNickname(event.target.value)} required/>
    {!roomId && <fieldset className="pace-picker"><legend>Темп вечера</legend><label><input type="radio" name="pace" checked={pace === 'normal'} onChange={() => setPace('normal')}/> Обычный</label><label><input type="radio" name="pace" checked={pace === 'relaxed'} onChange={() => setPace('relaxed')}/> Без спешки</label></fieldset>}
    <label className="adult-check"><input type="checkbox" checked={adult} onChange={event => setAdult(event.target.checked)} required/><span>Мне есть 18 лет. Играю добровольно, любой раунд можно пропустить.</span></label><button className="game-primary full" disabled={busy || !adult || !nickname.trim()}>{busy ? 'Открываем комнату…' : roomId ? 'Присоединиться' : 'Создать комнату'}<span>↗</span></button></form>}
    {feedback()}{roomId && <a className="subtle-link" href="/">Создать свою комнату</a>}<div className="entry-footnote">7 раундов · для двоих · без победителей и проигравших</div></section></main><footer className="game-footer"><span>Приходи за игрой, возвращайся к своим.</span><span>Пробная колода · только по приглашению</span></footer></div>;

  function options(action: GameAction, selected: number | null) {
    return <div className="answer-options">{game!.round.options.map((option, index) => <button key={index} className={`answer-option ${selected === index ? 'selected' : ''}`} disabled={disabled || me!.submitted} onClick={() => act(action, { choice: index })}><span className="option-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span><span className="option-check">{selected === index ? '✓' : '↗'}</span></button>)}</div>;
  }
  let panel: ReactNode;
  if (game.phase === 'LOBBY') panel = <><div className="card-eyebrow">ВАША КОМНАТА ГОТОВА</div><h1>{peer ? 'Вы на месте. Начнём?' : 'Кое-кого не хватает'}</h1><p className="card-description">{peer ? 'Выбирайте за себя, угадывайте друг друга. Ответы откроются одновременно. За точную догадку — одно очко, за промах — новая история.' : 'Отправь приглашение. Здесь будет только твоя пара — случайных гостей не подселяем.'}</p><Orbit small/>
    <div className="invite-box"><label htmlFor="invite">Ссылка на вашу встречу</label><div><input id="invite" value={invite} readOnly onFocus={event => event.currentTarget.select()}/><button onClick={() => void copyLink()} aria-label="Копировать приглашение">{copied ? '✓' : '⧉'}</button></div></div>
    {!peer && <a className="subtle-link" href={invite} target="_blank" rel="noopener noreferrer">Открыть приглашение во второй вкладке ↗</a>}
    <div className="room-rules"><span>◷ {game.pace === 'relaxed' ? 'Более медленный темп' : 'Обычный темп'}</span><span>◇ Ответы скрыты до раскрытия</span></div>
    <button className="game-primary full" disabled={disabled || !peer || me.ready} onClick={() => act('ready')}>{me.ready ? `Ждём, когда ${peer?.nickname} будет готов…` : peer ? 'Я готов, поехали' : 'Ждём второго участника'}<span>✦</span></button></>;
  else if (game.phase === 'ANSWER' || game.phase === 'GUESS') panel = <><div className="card-eyebrow">{game.phase === 'ANSWER' ? 'СНАЧАЛА — ПРО ТЕБЯ' : 'ТЕПЕРЬ ПОПРОБУЙ УГАДАТЬ'}</div><h1>{game.round.prompt}</h1><p className="card-description">{game.phase === 'ANSWER' ? 'Что ближе именно тебе? Партнёр пока не увидит твой выбор.' : 'Какой вариант ближе партнёру? Твой собственный ответ уже сохранён.'}</p>
    {options(game.phase === 'ANSWER' ? 'answer' : 'guess', game.phase === 'ANSWER' ? game.myChoice : game.myGuess)}
    {me.submitted && <div className="saved-state" role="status"><span>✓</span> {game.phase === 'ANSWER' ? 'Твой выбор сохранён' : 'Догадка сохранена'}. Даём партнёру немного времени.</div>}
    <div className="turn-actions"><button className="game-text-button" disabled={disabled} onClick={() => act('skip')}>Пропустить раунд для обоих</button><button className="game-text-button" disabled={disabled || game.extended} onClick={() => act('extend')}>{game.extended ? 'Время продлено' : '+15 секунд'}</button></div></>;
  else if (game.phase === 'REVEAL' || game.phase === 'DISCUSSION') panel = <><div className="card-eyebrow">{game.skipped ? 'БЕЗ ОБЪЯСНЕНИЙ И ШТРАФОВ' : 'ВОТ ОНО КАК'}</div><h1>{game.skipped ? 'Этот вопрос отпускаем' : 'Чуть больше знаем друг друга'}</h1><p className="card-description">{game.skipped ? 'Ответы этого раунда скрыты, очки не начисляются. Впереди новая карточка.' : game.round.prompt}</p>
    {!game.skipped && <div className="reveal-grid">{game.reveal?.map(reveal => { const player = game.players.find(p => p.id === reveal.playerId)!; return <article key={player.id} className={`reveal-card seat-${player.seat}`}><span>{player.id === me.id ? 'Твой выбор' : player.nickname}</span><h2>{game.round.options[reveal.answer]}</h2><div className="reveal-result">{reveal.guess === null ? 'Догадку пропустили' : reveal.correct ? '✦ Догадка точная · +1' : 'Догадка не совпала — бывает'}</div></article>; })}</div>}
    {!game.skipped && <div className="conversation-seed"><span>ЕСТЬ О ЧЁМ ПОБОЛТАТЬ</span><p>{game.round.followUp}</p></div>}
    <button className="game-primary full" disabled={disabled || game.phase === 'REVEAL' || me.nextReady} onClick={() => act('next')}>{game.phase === 'REVEAL' ? 'Момент на удивление…' : me.nextReady ? 'Партнёр ещё рассматривает ответы…' : game.round.number === 6 ? 'К общему финалу' : 'Следующая карточка'}<span>→</span></button></>;
  else if (game.phase === 'FINAL') panel = <><div className="card-eyebrow">РАУНД 7 · ОДНА ИСТОРИЯ НА ДВОИХ</div><h1>{game.round.prompt}</h1><p className="card-description">{game.round.followUp} Здесь нет правильного ответа и не нужны очки.</p>{options('final', game.myChoice)}{me.submitted && <div className="saved-state" role="status"><span>✓</span> Твоя часть готова. Остался один штрих…</div>}<div className="turn-actions"><button className="game-text-button" disabled={disabled} onClick={() => act('skip')}>Оставить финал открытым</button><button className="game-text-button" disabled={disabled || game.extended} onClick={() => act('extend')}>+15 секунд</button></div></>;
  else if (game.phase === 'PAUSED') panel = <><div className="card-eyebrow">ВОЗЬМЁМ НЕБОЛЬШУЮ ПАУЗУ</div><h1>Кажется, кто-то отвлёкся</h1><p className="card-description">Ничего страшного. Если вы оба здесь, пропустим этот раунд и продолжим. Через 30 секунд без ответа встреча завершится.</p><Orbit small/><button className="game-primary full" disabled={disabled || !me.needsReturn} onClick={() => act('here')}>{me.needsReturn ? 'Я здесь, можно продолжать' : 'Ждём возвращения партнёра…'}<span>↗</span></button></>;
  else if (game.phase === 'RESULTS') {
    const ownScore = game.scores.find(s => s.playerId === me.id)!;
    panel = <><div className="card-eyebrow">ВОТ КАКОЙ ВЕЧЕР У НАС ПОЛУЧИЛСЯ</div><h1>Маленькая история.<br/><em>Теперь ваша.</em></h1><div className="story-card"><span>✦</span><p>{game.story}</p><small>{me.nickname} + {peer?.nickname}</small></div><div className="score-summary"><b>{ownScore.correct}<span> / {ownScore.opportunities}</span></b><p>Твоих точных догадок<br/><small>За эту партию. Людей в процентах не измеряем.</small></p></div><button className="game-primary full" disabled={disabled || me.rematchReady} onClick={() => act('rematch')}>{me.rematchReady ? 'Твоё «ещё» услышано. Ждём второго…' : 'Ещё одну?'}<span>↻</span></button><button className="game-secondary full" disabled={disabled} onClick={() => act('leave')}>На сегодня всё</button><p className="quiet-caption">Новая партия начнётся, только если оба захотят.</p></>;
  } else panel = <><div className="card-eyebrow">ДО НОВОЙ ИСТОРИИ</div><h1>Было здорово<br/><em>пересечься.</em></h1><Orbit small/><p className="card-description">{game.endReason}</p><a className="game-primary full" href="/">Новая встреча<span>↗</span></a></>;

  return <div className="game-app"><header className="game-topbar"><Brand/><div className="top-room"><span className="local-label">{game.phase === 'LOBBY' ? 'КОМНАТА ДЛЯ ДВОИХ' : 'УГАДАЙ МЕНЯ'}</span>{!['ENDED', 'RESULTS'].includes(game.phase) && <button className="game-text-button" onClick={() => setLeaveConfirm(true)}>Выйти</button>}</div></header>
    <main className="play-layout"><aside className="game-sidebar"><span className="overline">ВАША МАЛЕНЬКАЯ КОМПАНИЯ</span><div className="player-list">{[0, 1].map(seat => { const player = game.players[seat]; const present = player && now - player.lastSeenAt < 10000; return <div className="player-row" key={seat}><div className={`player-avatar seat-${seat}`}>{player?.nickname.slice(0, 1).toUpperCase() ?? '+'}</div><div><strong>{player?.nickname ?? 'Кто-то особенный'}{player?.id === me.id && <small> · ты</small>}</strong><span>{!player ? 'Ждём приглашённого' : !present ? 'Переподключается…' : game.phase === 'LOBBY' ? player.ready ? 'Готов к игре' : 'Знакомится с правилами' : player.submitted ? 'Выбор сделан ✓' : 'В комнате'}</span></div></div>; })}</div>
    <div className="sidebar-note"><span>✳</span><p>Можно угадать выбор.<br/>А можно приятно удивиться.</p></div><div className="game-principles"><p>◇ Никаких неловких признаний</p><p>◇ Любой раунд можно пропустить</p><p>◇ Никаких очков за скорость</p></div></aside>
    <section className="play-center"><div className="round-strip"><span>{game.phase === 'LOBBY' ? 'ПЕРЕД СТАРТОМ' : game.phase === 'ENDED' ? 'ВСТРЕЧА ЗАВЕРШЕНА' : `РАУНД ${game.round.number} ИЗ 7`}</span>{seconds !== null && <span className={`game-timer ${seconds <= 5 ? 'timer-low' : ''}`} aria-label={`Осталось ${seconds} секунд`}>◷ {seconds} с</span>}</div>{!['LOBBY', 'ENDED'].includes(game.phase) && <div className="round-track" aria-label={`Раунд ${game.round.number} из 7`}>{Array.from({ length: 7 }, (_, i) => <i className={i < game.round.number ? 'filled' : ''} key={i}/>)}</div>}
    <div className={`game-card phase-${game.phase}`} key={`${game.gameId}-${game.round.number}-${game.phase}`}><div className="card-corner" aria-hidden="true">✦</div>{panel}{feedback()}</div>
    {!['LOBBY', 'ENDED'].includes(game.phase) && <div className="reaction-bar"><span>Вместо тысячи слов</span><div>{REACTIONS.map(emoji => <button key={emoji} disabled={disabled} aria-label={`Реакция ${emoji}`} onClick={() => act('react', { reaction: emoji })}>{emoji}</button>)}</div></div>}
    <div className="flying-reactions" aria-live="polite">{game.reactions.filter(r => now - r.at < 3500).map(reaction => <span key={reaction.id}>{reaction.emoji}<small>{game.players.find(p => p.id === reaction.playerId)?.nickname}</small></span>)}</div></section>
    <aside className="right-note"><span className="overline">СЕГОДНЯ В КОЛОДЕ</span><h2>{game.phase === 'LOBBY' ? 'Чуть-чуть магии. Много любопытства.' : game.round.topic}</h2><p>{game.phase === 'GUESS' ? 'Выбор партнёра всё ещё скрыт. Прислушайся к интуиции.' : 'Здесь важнее повод поговорить, чем правильный ответ.'}</p><div className="tiny-orbit" aria-hidden="true">✧</div></aside></main>
    <footer className="game-footer"><span>Приходи за игрой, возвращайся к своим.</span><span>Локальная встреча · 18+</span></footer>
    {leaveConfirm && <div className="modal-backdrop"><section ref={exitDialog} className="exit-dialog" role="dialog" aria-modal="true" aria-labelledby="exit-title"><h2 id="exit-title">Закончить встречу?</h2><p>Можно уйти в любой момент. Партнёр увидит, что игра завершена.</p><button className="game-primary full" disabled={busy} onClick={() => { setLeaveConfirm(false); act('leave'); }}>Да, на сегодня всё</button><button className="game-secondary full" onClick={() => setLeaveConfirm(false)}>Остаться</button></section></div>}
  </div>;
}
