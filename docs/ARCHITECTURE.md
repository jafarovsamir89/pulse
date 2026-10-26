# PULSE — архитектура v0.4

**25.10.2026 · целевая схема, не готовый сервис.** Текущая alpha находится в отдельном PR №1; [аудит](strategy/TECHNICAL_REVIEW.md) сохраняет найденные проблемы. Не переписывать стек ради смены концепции.

## Основание

React/TypeScript/Vite; NestJS modular monolith; PostgreSQL/Prisma как источник durable state; Redis для presence/лимитов/коротких подсказок; Socket.IO transport. LiveKit/WebRTC позже. Один backend и DB до доказанной необходимости разделения. Ни Kafka, ни ML matchmaking, ни собственный SFU для G1 не нужны.

Модули: Identity/Admission, Lobby/Matchmaking, GameEngine, Content, Chat, Continuation/Connections, TrustSafety, Analytics. Границы логические; не восемь микросервисов. GameEngine — чистые переходы + транзакционный application layer, пригодный для deterministic tests.

## Данные

| Сущность | Инвариант |
|---|---|
| User/Session/Admission | Только active eligible subject; приватные данные не в Profile |
| Lobby/Invite/Offer | TTL, max uses, revoke, безопасный ready check, не более одного активного места |
| GameSession/GameMember | Тип/версия/состояние; member права и epoch; история завершения |
| Round/CardVersion | Серверный deadline и допустимые команды; версия контента immutable |
| SecretAnswer/Guess | UNIQUE(round,user,kind); приватные до reveal, никакого client-side preload |
| ScoreEvent | UNIQUE(round,user,reason); точно один эффект принятой команды |
| ClientCommand/OutboxEvent | Идемпотентность; durable event ID/cursor; публикация после commit |
| ReMeetConsent | Обоюдный scoped opt-in на ограниченное игровое приглашение |
| ContactEdge | Каноническая unordered пара + независимый DM consent; revoke без resurrection |
| Circle/CircleMember | ≥3 явных согласия; invite/read права scoped; выход и блокировки |
| Block/Report/ModerationAudit | Актуальные ограничения, private evidence, moderator RBAC |

Это логическая модель. Проверить текущую Prisma schema перед миграциями; не создавать параллельные несовместимые Contacts.

## Команда и переход

WAITING → READY_CHECK → INTRO → PROMPT → PRIVATE_ANSWER → PREDICT → LOCKED → REVEAL → DISCUSSION → NEXT_ROUND → RESULTS → CLOSED. Rematch создаёт новый game ID; не переоткрывает завершённую игру. Общий финал — отдельный тип раунда без оценочного прогноза.

Команда содержит commandId, gameId, expectedVersion, roundId, payload; subject выводится из auth. В транзакции: проверка session/admission/member/block/phase/deadline → compare-and-set version → запись ответа/score → outbox. Дубликат возвращает исходный результат без второго эффекта. Поздний ответ отклоняется с актуальным snapshot. Клиентский таймер только отображает серверный deadline.

Deadline worker и входящая команда используют один переход с блокировкой строки/version CAS. Истечение Redis не делает DB-room бессмертной. После перезапуска восстанавливать overdue transitions, не начинать раунд заново. Проверить конкурентные процессы, а не только последовательные вызовы.

## Секреты, события, отзыв доступа

Раздельные public/private DTO и query paths. До reveal нельзя получить чужой answer/guess в REST, socket, snapshot, логах, аналитике, error payload или host UI. Moderation доступа «посмотреть все секреты» нет по умолчанию; evidence по утверждённой политике.

Socket handshake недостаточен: права проверяются для команд и доставки. Logout, ban, deletion и block меняют epoch/membership и закрывают разрешённые подписки. Fan-out не отправляет событие уже отозванному получателю. «Мгновенно» означает прекращение новых доставок после commit; уже доставленное нельзя стереть из памяти другого человека.

Block(A,B) не отменяет чужой матч B–C. В группе политика выхода A описана в PRD; не раскрывать виновника. Concurrent vote/revoke не восстанавливает ContactEdge; одна каноническая пара может иметь историю нескольких игр.

## Сеть

At-most-once transport не означает guaranteed delivery. Нужны ACK после DB commit, client command ID, ordered event cursor, bounded replay и member-filtered snapshot. Предыдущее состояние UI показывать как pending/failed, не притворяться отправленным. Reconnect не выдаёт секреты и не удваивает очки.

История с pagination; тест >100 сообщений. Outbox publisher допускает дубли; клиенты/потребители дедуплицируют event ID. При потере Redis новые admits/rate-limited операции fail closed, но leave/report должны иметь безопасный ограниченный путь через durable service; автоматическое восстановление connections/readiness отдельно от liveness.

[Socket.IO delivery](https://socket.io/docs/v4/delivery-guarantees/), [multi-node](https://socket.io/docs/v4/using-multiple-nodes/), [recovery](https://socket.io/docs/v4/connection-state-recovery/). Обычный Redis Pub/Sub adapter не заменяет durable replay. Конкретные пакеты/версии выбрать при реализации по текущим docs.

## Matching и компании

Hard constraints: допуск, язык, формат, реальные ready, bans/blocks, общие разрешённые темы. Soft constraints: время ожидания, повторяемость пары по желанию, избегание быстрого повторного неприятного контакта. Не строить personality score из переписок. Пол не требуется.

Invite и queue — два входа в одинаковый GameEngine. Расписание ограничивает стартовый stranger-pool, но приватная игра с другом не зависит от нахождения незнакомца. Группа не стартует с фиктивными игроками. Scope consent и expiry проверяются при каждом будущем приглашении.

## Эксплуатация и рост

G1: один API, managed DB, Redis, backups, лимиты, мониторинг game transitions и жалоб. При 100/1k CCU сначала измерить p95, lag, reconnect storms. При 10k — несколько API, общий adapter/outbox, DB indexes/pool, partition по game ID. 100k требует отдельного нагрузочного проекта, региона/юррисдикции и capacity planning, не настройки одного лимита.

Верификация: clean install/generate/typecheck; unit state transitions; real local Postgres/Redis integration; 2–4 browser E2E; concurrency/fault/revoke/restore. Только synthetic identities и explicit loopback endpoints. Production миграции/деплой не относятся к локальной проверке.

Инфраструктурный бюджет и graceful shutdown: не начинать новые игры при превышении разрешённой ёмкости; завершать существующие, не отрезать safety. Voice отдельный feature flag, scoped tokens, server-side remove participant и бюджет participant-minutes, без записи по умолчанию.
