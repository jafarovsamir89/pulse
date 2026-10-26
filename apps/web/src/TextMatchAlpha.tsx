import './style.css';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { messageSchema, queueRequestSchema } from '@pulse/contracts';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/v1';
const API_ORIGIN = API.replace(/\/v1\/?$/, '');
type Profile = { nickname: string; language: string; avatarPreset: string; interests?: string[]; rulesAcceptedAt?: string | null };
type Message = { id?: string; authorId: string; text: string; clientMessageId: string; createdAt?: string };
type Session = { id: string; messages?: Message[]; offer?: { userAId: string; userBId: string } };
type Contact = { id: string; peer: { nickname: string; avatarPreset: string; language: string }; createdAt: string };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...options, credentials: 'include', headers: { 'content-type': 'application/json', ...options.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `Ошибка запроса (${response.status})`);
  return body as T;
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [finishedSessionId, setFinishedSessionId] = useState('');
  const [offerId, setOfferId] = useState('');
  const [offerAccepted, setOfferAccepted] = useState(false);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [devIdentity, setDevIdentity] = useState<'test-adult-a' | 'test-adult-b'>('test-adult-a');
  const [activeView, setActiveView] = useState<'match' | 'contacts' | 'profile'>('match');
  const socket = useRef<Socket | null>(null);
  const polling = useRef<number | null>(null);

  async function loadMe() {
    try {
      const data = await request<{ id: string; profile: Profile | null }>('/me');
      setUserId(data.id); setProfile(data.profile);
    } catch { setProfile(null); }
  }
  useEffect(() => { void loadMe(); return () => { socket.current?.disconnect(); if (polling.current) window.clearInterval(polling.current); }; }, []);

  async function devLogin(event: FormEvent) {
    event.preventDefault(); setStatus('Подключаем локальную тестовую учётную запись…');
    try { await request('/auth/dev-session', { method: 'POST', body: JSON.stringify({ identity: devIdentity }) }); await loadMe(); setStatus(''); }
    catch (error) { setStatus((error as Error).message); }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      const data = await request<{ profile: Profile }>('/me/profile', { method: 'PATCH', body: JSON.stringify({ nickname: String(form.get('nickname')), language: String(form.get('language')), avatarPreset: 'orbit', interests: [], acceptRules: form.get('acceptRules') === 'on' }) });
      setProfile(data.profile); setStatus('');
    } catch (error) { setStatus((error as Error).message); }
  }

  async function refreshMatchState() {
    try {
      const state = await request<{ state: string; offerId?: string; session?: Session }>('/text-match/queue/current');
      if (state.state === 'offer_pending' && state.offerId) { setOfferId(state.offerId); setSearching(false); setStatus('Нашёлся собеседник. Подтвердите встречу в течение 30 секунд.'); }
      if (state.state === 'in_session' && state.session) { setSession(state.session); setMessages(state.session.messages ?? []); setSearching(false); setStatus('Вы встретились. Начните с лёгкого вопроса или просто поздоровайтесь.'); }
      if (state.state === 'idle') { setSearching(false); setOfferId(''); }
    } catch (error) { setStatus((error as Error).message); }
  }
  useEffect(() => { if (userId) void refreshMatchState(); }, [userId]);
  useEffect(() => {
    if (!session?.id) return;
    const client = io(`${API_ORIGIN}/chat`, { withCredentials: true, transports: ['websocket', 'polling'] });
    socket.current = client;
    client.on('connect', () => client.emit('match.join', { sessionId: session.id }));
    client.on('match.message', (message: Message) => setMessages(items => items.some(item => item.clientMessageId === message.clientMessageId) ? items : [...items, message]));
    client.on('match.closed', (event: { sessionId: string; reason: 'ended' | 'blocked' }) => {
      if (event.sessionId !== session.id) return;
      setSession(null); setMessages([]);
      if (event.reason === 'ended') { setFinishedSessionId(event.sessionId); setStatus('Собеседник завершил разговор. Вы можете решить, хотите ли остаться на связи.'); }
      else { setFinishedSessionId(''); setStatus('Разговор завершён после блокировки. Повторная встреча исключена.'); }
    });
    client.on('connect_error', () => setStatus('Связь прервалась. Переподключаемся…'));
    return () => { client.disconnect(); socket.current = null; };
  }, [session?.id]);
  useEffect(() => {
    if (!searching && !offerId) return;
    polling.current = window.setInterval(() => void refreshMatchState(), 1500);
    return () => { if (polling.current) window.clearInterval(polling.current); polling.current = null; };
  }, [searching, offerId]);

  async function startSearch() {
    const parsed = queueRequestSchema.safeParse({ language: profile?.language ?? 'ru', idempotencyKey: crypto.randomUUID() });
    if (!parsed.success) { setStatus('Не удалось начать поиск.'); return; }
    setSearching(true); setStatus('Ищем реального собеседника с совместимым языком.');
    try { const result = await request<{ state: string; offerId?: string }>('/text-match/queue', { method: 'POST', body: JSON.stringify(parsed.data) }); if (result.offerId) setOfferId(result.offerId); }
    catch (error) { setSearching(false); setStatus((error as Error).message); }
  }
  async function cancelSearch() {
    try { await request('/text-match/queue/current', { method: 'DELETE' }); setSearching(false); setOfferId(''); setStatus('Поиск остановлен.'); }
    catch (error) { setStatus((error as Error).message); }
  }
  async function answerOffer(accept: boolean) {
    try { const result = await request<{ state: string }>(`/text-match/offers/${offerId}/${accept ? 'accept' : 'decline'}`, { method: 'POST' }); if (result.state === 'waiting_for_other') { setOfferAccepted(true); setStatus('Вы подтвердили встречу. Ожидаем ответ второго участника.'); return; } setOfferAccepted(false); setOfferId(''); await refreshMatchState(); }
    catch (error) { setOfferId(''); setStatus((error as Error).message); }
  }
  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const parsed = messageSchema.safeParse({ text, clientMessageId: crypto.randomUUID() });
    if (!session || !parsed.success || !socket.current?.connected) { setStatus('Сообщение пока не отправлено. Проверьте соединение.'); return; }
    const draft: Message = { authorId: userId, text: parsed.data.text, clientMessageId: parsed.data.clientMessageId, createdAt: new Date().toISOString() };
    setMessages(items => [...items, draft]); setText('');
    socket.current.emit('match.send', { sessionId: session.id, ...parsed.data }, (ack: { error?: string } | undefined) => { if (ack?.error) setStatus('Не удалось отправить сообщение.'); });
  }
  async function leave() {
    if (!session) return;
    try { await request(`/text-match/sessions/${session.id}/leave`, { method: 'POST' }); socket.current?.disconnect(); setFinishedSessionId(session.id); setSession(null); setMessages([]); setStatus(''); }
    catch (error) { setStatus((error as Error).message); }
  }
  async function vote(wantsContact: boolean) {
    if (!finishedSessionId) return;
    try { const result = await request<{ status: string }>(`/text-match/sessions/${finishedSessionId}/contact-vote`, { method: 'POST', body: JSON.stringify({ wantsContact }) }); setStatus(result.status === 'ACTIVE' ? 'Вы оба согласились остаться на связи.' : wantsContact ? 'Ваш выбор сохранён. Контакт появится только при согласии обоих.' : 'Контакт не будет создан.'); setFinishedSessionId(''); }
    catch (error) { setStatus((error as Error).message); }
  }
  async function safetyAction(kind: 'blocks' | 'reports') {
    if (!session?.offer) return;
    const targetUserId = session.offer.userAId === userId ? session.offer.userBId : session.offer.userAId;
    try {
      await request(`/safety/${kind}`, { method: 'POST', body: JSON.stringify(kind === 'blocks' ? { targetUserId } : { targetUserId, sessionId: session.id, category: 'other' }) });
      if (kind === 'reports') await request(`/text-match/sessions/${session.id}/leave`, { method: 'POST' });
      socket.current?.disconnect(); setSession(null); setMessages([]); setFinishedSessionId(''); setStatus(kind === 'blocks' ? 'Пользователь заблокирован. Повторная встреча исключена.' : 'Жалоба отправлена. Разговор завершён.');
    }
    catch (error) { setStatus((error as Error).message); }
  }

  if (!userId) return <main className="login-shell"><div className="brand"><span className="brand-mark">p</span>PULSE</div><section className="login-card"><p className="eyebrow">Разговор начинается просто</p><h1>Будь собой.<br /><em>Без лишних ожиданий.</em></h1><p className="intro">Короткий текстовый разговор с реальным человеком. Продолжение — только по взаимному желанию.</p>{import.meta.env.VITE_DEV_AUTH_ENABLED === 'true' ? <form onSubmit={devLogin} className="dev-login"><label htmlFor="test-identity">Локальный вход для разработки</label><select id="test-identity" value={devIdentity} onChange={e => setDevIdentity(e.target.value as typeof devIdentity)}><option value="test-adult-a">Тестовый взрослый A</option><option value="test-adult-b">Тестовый взрослый B</option></select><button className="primary">Войти в локальную среду <span>↗</span></button></form> : <p className="notice">Регистрация временно закрыта: подключение настоящего провайдера возраста ещё не настроено.</p>}<p className="legal">Только 18+. Не показываем email и личные данные собеседнику. Это локальная alpha-версия.</p>{status && <p role="status" className="feedback">{status}</p>}</section><footer>Псевдонимы · взаимное согласие · право уйти в любой момент</footer></main>;
  if (activeView === 'contacts') return <ContactsPage onBack={() => setActiveView('match')} userId={userId} />;
  if (activeView === 'profile' && profile) return <ProfilePage profile={profile} onBack={() => setActiveView('match')} onLogout={async () => { await request('/auth/logout', { method: 'POST' }); setUserId(''); setProfile(null); setActiveView('match'); }} onDelete={async () => { await request('/me', { method: 'DELETE' }); setUserId(''); setProfile(null); setStatus('Запрос на удаление аккаунта принят.'); }} />;
  if (!profile) return <main className="login-shell"><section className="login-card"><p className="eyebrow">Твоя анкета</p><h1>Как к тебе<br /><em>обращаться?</em></h1><p className="intro">Псевдоним и язык помогают подобрать разговор. Личные данные другим участникам не видны.</p><form onSubmit={saveProfile} className="dev-login"><label htmlFor="nickname">Псевдоним</label><input id="nickname" name="nickname" minLength={2} maxLength={32} placeholder="Например, Лира" required /><label htmlFor="language">Язык общения</label><select id="language" name="language"><option value="ru">Русский</option><option value="az">Azərbaycan dili</option><option value="en">English</option></select><label className="check"><input type="checkbox" name="acceptRules" required /> Я принимаю правила общения</label><button className="primary">Сохранить профиль <span>↗</span></button></form>{status && <p role="status" className="feedback">{status}</p>}</section></main>;

  return <div className="app-shell"><header className="topbar"><a className="brand" href="#home"><span className="brand-mark">p</span>PULSE</a><div className="top-actions"><span className="user-chip"><span className="avatar">{profile.nickname.slice(0, 1)}</span>{profile.nickname}</span><button className="icon-button" aria-label="Выйти" onClick={async () => { await request('/auth/logout', { method: 'POST' }); setUserId(''); setProfile(null); }}>↗</button></div></header><main className="dashboard"><aside className="side-note"><span className="eyebrow">ТВОЁ ПРОСТРАНСТВО</span><h2>Близость начинается<br />с простого «привет».</h2><p>Без гонки за лайками. Без обязательных фото. Просто короткий разговор, если оба готовы.</p><div className="privacy-note"><span>✳</span><div><strong>Твои границы важны</strong><small>Можно уйти, пожаловаться или заблокировать в любой момент.</small></div></div></aside><section className="match-card"><div className="card-topline"><span className="pill"><i /> TEXT MATCH</span><button className="text-button" onClick={async () => { await request('/auth/logout', { method: 'POST' }); setUserId(''); setProfile(null); }}>Выйти</button></div>{session ? <><p className="eyebrow">ВАШ РАЗГОВОР</p><h1>Начните с простого.</h1><p className="subcopy">Вы оба подтвердили встречу. Никаких обязательств продолжать.</p><div className="chat-window" aria-live="polite">{messages.map((message, i) => <div key={message.clientMessageId || message.id || i} className={`bubble ${message.authorId === userId ? 'mine' : ''}`}><span>{message.text}</span></div>)}</div><form className="message-form" onSubmit={sendMessage}><input aria-label="Ваше сообщение" maxLength={1000} value={text} onChange={e => setText(e.target.value)} placeholder="Напиши привет…" /><button aria-label="Отправить" disabled={!text.trim()}>↑</button></form><div className="session-actions"><button className="quiet-button" onClick={() => void safetyAction('reports')}>Пожаловаться</button><button className="quiet-button" onClick={() => void safetyAction('blocks')}>Заблокировать</button><button className="quiet-button danger" onClick={() => void leave()}>Завершить</button></div></> : finishedSessionId ? <><div className="match-orbit"><span>✳</span></div><p className="eyebrow">РАЗГОВОР ЗАВЕРШЁН</p><h1>Хотите остаться<br /><em>на связи?</em></h1><p className="subcopy">Контакт и постоянные сообщения появятся только при двух ответах «Да».</p><div className="offer-actions"><button className="primary" onClick={() => void vote(true)}>Да, продолжить общение <span>↗</span></button><button className="quiet-button" onClick={() => void vote(false)}>Нет, завершить</button></div></> : offerId ? <><div className="match-orbit"><span>✳</span></div><p className="eyebrow">СОБЕСЕДНИК НАЙДЕН</p><h1>Готовы познакомиться?</h1><p className="subcopy">Оба должны подтвердить встречу. Если кто-то не готов, поиск завершится без давления.</p><div className="offer-actions"><button className="primary" disabled={offerAccepted} onClick={() => void answerOffer(true)}>{offerAccepted ? "Ожидаем ответ второго участника" : "Подтвердить встречу"} <span>↗</span></button>{!offerAccepted && <button className="quiet-button" onClick={() => void answerOffer(false)}>Не сейчас</button>}</div></> : searching ? <><div className="match-orbit searching"><span>✳</span></div><p className="eyebrow">ТИХО ИЩЕМ</p><h1>Настоящий собеседник.<br /><em>Когда он будет рядом.</em></h1><p className="subcopy">Подбираем человека, который сейчас тоже ищет разговор на {profile.language === 'ru' ? 'русском' : profile.language === 'az' ? 'азербайджанском' : 'английском'}.</p><div className="status-card"><span className="pulse-dot" />В очереди — только реальные участники. Мы не создаём фальшивых профилей.</div><button className="quiet-button" onClick={() => void cancelSearch()}>Остановить поиск</button></> : <><div className="match-orbit"><span>✳</span></div><p className="eyebrow">КОРОТКИЙ ТЕКСТОВЫЙ РАЗГОВОР</p><h1>Хочется с кем-то<br /><em>поговорить?</em></h1><p className="subcopy">Найдём одного реального собеседника с общим языком. Сначала вы оба подтвердите встречу.</p><button className="primary find-button" onClick={() => void startSearch()}>Найти собеседника <span>↗</span></button><p className="tiny-note">Обычно несколько минут в активные часы. Ожидание честное — без ботов и имитации онлайна.</p></>}{status && <p role="status" className="feedback">{status}</p>}</section><aside className="right-rail"><div className="topic-card"><span className="eyebrow">ЛЁГКИЙ СТАРТ</span><h3>Если не знаешь,<br />что написать</h3><p>«Какой маленький момент сегодня сделал день лучше?»</p><span className="spark">✳</span></div><div className="principle"><span>01</span><div><strong>Сначала коротко</strong><small>Никаких обязательств.</small></div></div><div className="principle"><span>02</span><div><strong>Продолжить — вдвоём</strong><small>Постоянный контакт только по взаимному согласию.</small></div></div></aside></main><nav className="bottom-nav" aria-label="Навигация"><button className="nav-item active" onClick={() => setActiveView('match')}>◉ <small>Общение</small></button><button className="nav-item" disabled>▦ <small>Комнаты · позже</small></button><button className="nav-item" onClick={() => setActiveView('contacts')}>♡ <small>Связи</small></button><button className="nav-item" onClick={() => setActiveView('profile')}>◌ <small>Профиль</small></button></nav></div>;
}

function ContactsPage({ onBack, userId }: { onBack: () => void; userId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [active, setActive] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { void request<Contact[]>('/text-match/contacts').then(setContacts).catch(e => setError((e as Error).message)); }, []);
  async function openContact(contact: Contact) {
    setActive(contact); setError('');
    try { setMessages(await request<Message[]>(`/text-match/contacts/${contact.id}/messages`)); }
    catch (e) { setError((e as Error).message); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (!active || !text.trim()) return;
    const input = { text: text.trim(), clientMessageId: crypto.randomUUID() };
    try { const message = await request<Message>(`/text-match/contacts/${active.id}/messages`, { method: 'POST', body: JSON.stringify(input) }); setMessages(items => [...items, message]); setText(''); }
    catch (e) { setError((e as Error).message); }
  }
  return <AppSubpage title="Связи" onBack={onBack}><p className="subcopy">Здесь только взаимно сохранённые контакты. Без согласия обоих постоянные сообщения недоступны.</p><div className="contact-layout"><div className="contact-list">{contacts.length ? contacts.map(contact => <button key={contact.id} className={`contact-row ${active?.id === contact.id ? 'selected' : ''}`} onClick={() => void openContact(contact)}><span className="avatar">{contact.peer.nickname.slice(0, 1)}</span><span><strong>{contact.peer.nickname}</strong><small>Взаимный контакт</small></span></button>) : <p className="empty-state">Пока нет контактов. После разговора вы оба сможете решить, хотите ли продолжить общение.</p>}</div>{active && <section className="contact-chat"><h2>{active.peer.nickname}</h2><div className="chat-window">{messages.map(message => <div key={message.clientMessageId} className={`bubble ${message.authorId === userId ? 'mine' : ''}`}>{message.text}</div>)}</div><form className="message-form" onSubmit={send}><input aria-label="Сообщение контакту" value={text} maxLength={1000} onChange={e => setText(e.target.value)} placeholder="Напиши сообщение…" /><button aria-label="Отправить" disabled={!text.trim()}>↑</button></form></section>}</div>{error && <p role="status" className="feedback">{error}</p>}</AppSubpage>;
}

function ProfilePage({ profile, onBack, onLogout, onDelete }: { profile: Profile; onBack: () => void; onLogout: () => Promise<void>; onDelete: () => Promise<void> }) {
  return <AppSubpage title="Профиль" onBack={onBack}><div className="profile-summary"><span className="avatar large">{profile.nickname.slice(0, 1)}</span><div><h2>{profile.nickname}</h2><p>{profile.language.toUpperCase()} · абстрактный аватар</p></div></div><p className="subcopy">Другим участникам видны только псевдоним, язык и выбранный пресет аватара.</p><div className="profile-actions"><button className="quiet-button" onClick={() => void onLogout()}>Выйти из аккаунта</button><button className="quiet-button danger" onClick={() => void onDelete()}>Запросить удаление аккаунта</button></div><p className="tiny-note">Запрос остановит доступ к аккаунту. Фактические сроки удаления данных и законные исключения требуют отдельной утверждённой политики хранения.</p></AppSubpage>;
}

function AppSubpage({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#home"><span className="brand-mark">p</span>PULSE</a><button className="quiet-button" onClick={onBack}>← Назад</button></header><main className="subpage"><p className="eyebrow">PULSE · ПРОСТРАНСТВО ОБЩЕНИЯ</p><h1>{title}</h1>{children}</main></div>;
}
