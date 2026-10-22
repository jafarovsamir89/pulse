# PULSE — техническая архитектура / design draft (с addendum v0.2)

**Дата:** 21.10.2026. **Важное уточнение:** ниже исторические event-first схемы дополнены актуальным Text Match-first v0.2 в конце. Читай addendum вместе с PRD v0.2. Целевая архитектура, **не описание уже работающего сервиса**. Основной принцип: минимальный монолит, собственные правила подбора/безопасности и управляемый RTC для голоса.

## 1. Технологии и причины выбора

| Слой | Выбор | Почему |
|---|---|---|
| Web/PWA | React + TS + Vite | быстрый мобильный веб для invite-links, без обязательного магазина |
| Backend | NestJS + TS | единый язык, модульные сервисы, guards, WebSocket gateway |
| DB | PostgreSQL + Prisma | транзакции, ограничения целостности, миграции |
| Queue/Presence | Redis | короткоживущий presence, rate limiting, очереди, не источник истины о денежных/аккаунтных данных |
| Events | Socket.IO | авторизованное двунаправленное текстовое общение |
| Voice (S2) | LiveKit Cloud | WebRTC SFU, scoped tokens, метрики participant-minutes |
| Infra | Docker Compose для dev | воспроизводимый старт на Mac/PC, отдельный staging |
| Monitoring | OpenTelemetry/Sentry/метрики | ошибки, p95, репорты, отказ очереди |
| Mobile later | React Native/Expo | единые контракты; после проверки UX Web |

Не вводить микросервисы и Kafka до подтверждённой необходимости. Не использовать сторонний сервис звонков без расчёта стоимости и review условий данных.

## 2. Предлагаемое монорепо

```text
pulse/
  apps/
    web/              # React/Vite/PWA
    api/              # NestJS REST + Socket.IO
    admin/            # позже: защищённая модераторская панель
    mobile/           # после беты
  packages/
    contracts/        # общие API DTO и schemas, строго типизированные
    ui/               # позже общие элементы интерфейса
  infra/
    compose.yaml
  prisma/
    schema.prisma
    migrations/
  docs/
  prototype/          # демонстрация, не клиент production
  spikes/             # изолированные исследования
```

## 3. Границы модулей API

- `Identity`: authentication, sessions, age gate, deletions, roles; passwords/OTP через надёжного провайдера либо проверенную реализацию.
- `Profiles`: nicknames, language, interests; приватные vs публичные поля, coarse city opt-in.
- `Events`: расписание тематических вечеров, темы, host, capacity, lifecycle.
- `Matchmaking`: join queue, atomic seat reservation, language+time+topic, safe exclusions, opt-in balance.
- `Chat`: message validation/persistence TTL, read permissions, mute/ban.
- `Prompts`: moderated starter questions and mini-games, no popularity metrics.
- `Contacts`: mutual-only, revocable relationships; не доступен до S2.
- `TrustSafety`: reports, blocks, enforcement, appeals, audit; независим от monetization.
- `RTC`: short-lived server-issued LiveKit tokens with event ID membership check, on/off flag.
- `Analytics`: de-identified structured events without content of chat or personal details.

## 4. DB сущности (высокоуровнево)

- `User(id, createdAt, status, ageGateStatus, deleteRequestedAt)`
- `UserPrivate(userId, authProviderId, optionalEncryptedEmail, verificationState)` — отдельная политика доступа.
- `Profile(userId, nickname, avatarPresetId, language, displayCityNullable)`.
- `MatchPreferences(userId, topicIds, roomMode, genderSelfDescriptionNullablePrivate)` — приватный атрибут, не публичный фильтр внешности.
- `Event(id, topic, language, startsAt, maxParticipants, status, hostIdNullable)`.
- `QueueEntry(id, eventId, userId, mode, joinedAt, expiresAt, status)`.
- `Room(id, eventId, mode, status, minSize, maxSize, startedAt, endedAt)`.
- `RoomMember(roomId, userId, role, joinedAt, leftAt, status)`.
- `Message(id, roomId, authorId, content, createdAt, expiresAt, moderationState)`.
- `Block(blockerUserId, blockedUserId, createdAt)`.
- `Report(id, reporterId, targetType, targetId, category, createdAt, status, assignedModeratorIdNullable)`.
- `ModerationAction(id, actorId, subjectId, type, reason, createdAt, expiresAtNullable)`.
- `ContactRequest(id, fromUserId, toUserId, sharedRoomId, status, createdAt)`.
- `ConsentReceipt(userId, consentType, policyVersion, grantedAt, revokedAtNullable)`.
- `AuditEvent(id, actor, action, time, structuredData)` — разделить доступные и секретные данные.

Состав таблиц пересмотреть при реализации; не хранить пол/гендер там, где функция не требует, не делать точную геолокацию обязательной.

## 5. API-контракты (проект)

```http
POST   /v1/auth/start
POST   /v1/auth/verify
GET    /v1/me
PATCH  /v1/me/profile
DELETE /v1/me
GET    /v1/events?language=ru&topic=talk
POST   /v1/events/{id}/join-queue
DELETE /v1/queue/{entryId}
GET    /v1/queue/{entryId}
GET    /v1/rooms/{roomId}
POST   /v1/rooms/{roomId}/leave
POST   /v1/blocks
POST   /v1/reports
POST   /v1/rooms/{roomId}/rtc-token        # feature flag, S2
POST   /v1/contacts/requests               # mutual-only, S2
```

WebSocket события (должны проверяться на сервере):

```text
room.join        { roomId }                  -> room.joined | room.error
room.send        { roomId, text, clientId }  -> room.message | room.error
room.leave       { roomId }                  -> room.left
room.prompt      { roomId, promptId }        -> room.prompted (host/system only)
room.presence    { roomId, count }           -> validated aggregate only
room.moderate    { roomId, targetId, action } -> privileged + audit
```

Не передавать authentication через доверие клиентскому `userId`; сервер устанавливает subject из проверенной сессии.

## 6. Матчинг: безопасность и атомарность

1. Сервер проверяет auth, возраст, active bans, выбранный режим, язык, время, отсутствие дубликата активного queue/room.
2. Сохраняет заявку с idempotency key, устанавливает TTL, проверяет лимиты.
3. Раз в короткий интервал (или по событию) подбирает кандидатов в одной когорте, исключая взаимные блокировки и прошлые жалобы с ограничениями.
4. Для `open` собирает группы 4–6. Для `balanced` формирует 2+2 либо 3+3 **только из opt-in доступных участников**. Не изобретает отсутствующих людей.
5. **Транзакция БД + row locks/unique indexes** фиксирует состав и меняет состояния заявок; Redis lock один не обеспечивает целостность.
6. Перед входом короткое подтверждение reservation; timeout освобождает места без «призрачного онлайна».
7. При shortage сообщает реальное состояние и предлагает режим open или следующий слот только по согласию.
8. При block/report/ban немедленно обновляет membership и токены RTC; повторный join проверяется сервером.

**Демо-алгоритм** в `spikes/` показывает только принцип равенства/вместимости. Он НЕ обеспечивает транзакционность, blocklists, очереди из сети и не пригоден для продакшена.

## 7. Trust boundary и злоупотребления

- TLS end-to-end; защищённая сессия; JWT lifetime короткий или secure-cookie с refresh rotation.
- Socket.IO авторизация при handshake И **каждом** send/join, запрет угаданного roomId (IDOR).
- DB constraints: one active membership per user, уникальность block pair, уникальный clientId message per sender для идемпотентности.
- Rate limits: IP/session/account + адаптация для accessibility; защита от invite spam.
- Контент: ограничение текста, neutralisation HTML, moderation queue; PII stripping из логов.
- REST/OpenAPI DTO validation, CORS/CSRF согласно модели auth, secrets manager.
- Audio: scoped токен `<roomId, identity, role, exp>` только сервером, комната без public key, запись выключена по умолчанию.
- Separate RBAC moderator/admin и MFA для админов; audit changes.

## 8. События, наблюдаемость и стоимость

- Публикуем `event_viewed`, `queue_joined`, `queue_wait_ms`, `room_started`, `participant_joined`, `safe_session_completed`, `report_submitted`, `contact_mutual`, `rtc_participant_minute`.
- Metrics не включают текст, точную локацию, номер, гендер другого участника.
- Dashboards: неполные комнаты, p95 wait, room crashes, жалобы на 100 session-hours, voice spend/day.
- Nightly integrity check: онлайн = authenticated active sockets/RTC participants, не регистрации.
- Затраты голоса оценивать по participant-minutes; нет монетизации до KPI.

## 9. Эволюция / CI

- CI: lint, typecheck, unit, integration (Postgres/Redis), migrations, security audit, E2E критических флоу.
- Staging с тестовыми accounts; synthetic users **только в тестовой среде**, никогда под видом людей в live.
- Feature flags: `voice_enabled`, `balanced_mode`, `contacts_enabled`, `offline_events_enabled`.
- Эксплуатация: backups + restore drill, health checks, alerting on report SLA, deploy rollback.


---

## v0.2 ADDENDUM — быстрый парный Text Match (21.10.2026)

**Актуальный источник продукта — PRD v0.2.** Выше в историческом черновике Event-first модель описывает будущие **Party Rooms**, но **первой сквозной вертикалью теперь является Text Match 1:1**. Не реализовывать календарь как условие первого матча.

### Дополнения к доменной модели

- `MatchQueue(id,userId,language,moodNullable,joinedAt,expiresAt,state,idempotencyKey)`.
- `MatchOffer(id,userAId,userBId,expiresAt,aAcceptedAtNullable,bAcceptedAtNullable,status)`.
- `MatchSession(id,offerId,startedAt,endedAt,status)`, строго два разных активных участника.
- `MatchMember(sessionId,userId,joinedAt,leftAt)`; unique active session per user (DB constraint).
- `MatchMessage(id,sessionId,authorId,text,createdAt,expiresAt,moderationState)`.
- `ContactEdge(userAId,userBId,consentAAtNullable,consentBAtNullable,status)`; DM только при двух согласиях, revoke/block атомарно закрывает возможность отправки.
- `UserBlock` распространяется на matching, match chat и Contacts/DM.

### Дополнительные endpoints (draft)

```http
POST   /v1/text-match/queue
GET    /v1/text-match/queue/current
DELETE /v1/text-match/queue/current
POST   /v1/text-match/offers/{offerId}/accept
POST   /v1/text-match/offers/{offerId}/decline
GET    /v1/text-match/sessions/current
POST   /v1/text-match/sessions/{id}/leave
POST   /v1/text-match/sessions/{id}/contact-vote
GET    /v1/contacts
POST   /v1/contacts/{id}/messages
POST   /v1/contacts/{id}/revoke
```

Chat Socket.IO: `match.join`, `match.send`, `match.leave`, `match.offer`, `match.accepted`, `match.failed` — server derives identity from auth. Offer acceptance and queue removal must be transaction-safe and idempotent. Explicitly test Redis expiry vs persistent DB state, race on dual clients, disconnect and ban/block mid-session. No store-policy workaround claims.

### Component decomposition and sequence

`Identity` -> `TextMatchService` (DB reservation + Redis TTL) -> `MatchChatGateway` -> `Contacts` -> `TrustSafety`. Party Rooms remain separate `Event/Room` subsystem; VoiceMatch and RTC introduced in P1. Reduce coupling by shared `ActiveSessionGuard`, `PolicyService`, and `ModerationAudit`.

### Prototype alignment

`prototype/index.html` reflects the old Event-first idea. It is not a working chat. Replace in Sprint 1 with an original Text Match-first UI; no fake users or fabricated counts.
