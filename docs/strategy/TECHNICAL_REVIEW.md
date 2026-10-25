# Технический аудит: основание пригодно, alpha не готова к пилоту

**25.10.2026.** Анализируется `main` на `7b64b57bc4d0f03acfc7e56659ad2bca88fc299f` и открытый [PR №1](https://github.com/jafarovsamir89/pulse/pull/1) на `2c37fb9e561148320c67a9ba71ea16b86f92ca6e`. Выводы привязаны к этому commit, а не к будущей версии ветки. В этом PR стратегии исходники не меняются.

## 1. Что существует

`main` содержит документы, HTML-концепт и исследовательский групповой matcher с 12 тестами. В PR №1 добавлены pnpm workspace, React/Vite, NestJS, Prisma/PostgreSQL, Redis rate limiting, Socket.IO, схема и миграция, queue/offer/session, взаимный контакт, DM, block/report и moderator API. Это частичная **локальная alpha**, не production-система. Только две синтетические dev-identity; production auth и провайдер возраста не реализованы. Voice/LiveKit, Android, PWA manifest/service worker, push, полноценных модераторских операций нет.

Сильные решения: серверный handshake; durable state в PostgreSQL; отдельные ограничения active slot/reservation; запрет fake users; отдельный dev login; validation DTO; хранение хэша сессионного токена; rate limits с отказом при недоступности защиты. Это полезные заготовки. Их наличие не доказывает корректность всех гонок и отзыва доступа.

React/TypeScript + Nest + PostgreSQL/Prisma + Redis подходят для первых этапов. Переписывание на другой язык или микросервисы сейчас отвлечёт от конкретных ошибок. Socket.IO подходит при явно построенном протоколе доставки. LiveKit можно добавить после доказательства потребности в голосе. Android — отдельный клиентский и магазинный gate; web-first не означает юридического освобождения.

## 2. Наблюдаемые результаты проверки

| Проверка | Результат и предел доказательства |
|---|---|
| Локальное открытие alpha | Главный экран и Connections доступны, поиск возвращает 503: недоступен Redis. Скриншоты в [UX_GAME_DESIGN.md](UX_GAME_DESIGN.md). Полный текущий UX-цикл не пройден |
| Предыдущий локальный verify | Зафиксирован в прежней работе как успешный. Не повторялся в аналитическом задании; не является доказательством чистой установки |
| CI на HEAD PR №1 | `research-tests` success, `verify` failure; typecheck останавливает pipeline до последующих проверок |
| Причина CI | TS2307: `express`/типы не разрешаются; отсутствуют сгенерированные Prisma-типы. В workflow нет явного `prisma generate`; прямые зависимости Express/types не заявлены в API package |
| E2E по коду | Четыре крупных сценария; Redis заменён `allow: async () => true`. Реальный отказ/лимит Redis этим набором не проверяется |
| UI/контракты | `node --test` без соответствующих тестов; успешный код выхода при нуле тестов не равен покрытию |

Доказательство CI: [run 40240424064 / job 121310844086](https://github.com/jafarovsamir89/pulse/actions/runs/40240424064/job/121310844086), проверено 25.10.2026. Локальная среда могла маскировать отсутствие явно объявленных зависимостей/генерации; точную причинную цепочку следует подтвердить чистой установкой, а не считать догадку окончательной. Требуемое следующее доказательство: fresh checkout → frozen install → generate → migrate local test DB → typecheck/tests/build. Deploy-скрипты для этого не нужны.

## 3. Статические находки, которые необходимо проверить и исправить

P1 — блокер допуска реальных незнакомых участников; P2 — существенная корректность/надёжность. Это **статический анализ**, если не помечено иначе. Эксплуатация на production не проводилась. Условия воспроизведения ниже предназначены для синтетической локальной среды.

| ID / уровень | Конкретный дефект и условие | Доказательство на проверенном SHA | Приёмка исправления |
|---|---|---|---|
| T01 / P1 | Неучастник с известным sessionId вызывает leave: service возвращает ended без членства, controller всё равно отключает сокеты комнаты | [match.ts:242](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/match.ts#L242), [controller:314](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/match.ts#L314), [gateway:24](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/chat.gateway.ts#L24) | Третий synthetic user не закрывает чужую реальную сессию; идемпотентный leave своего пользователя сохраняется |
| T02 / P1 | Logout/deletion отзывают HTTP auth, но не удаляют уже присоединившийся socket из комнаты. Отправка проверяет отправителя, не каждый получающий socket; возможна доставка после отзыва | [auth.ts:80](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/auth.ts#L80), [profile.ts:39](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/profile.ts#L39), [broadcast:53](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/chat.gateway.ts#L53) | После commit отзыва socket закрыт, дальнейших приватных событий нет; проверить logout, delete, suspend, expiry, несколько вкладок |
| T03 / P1 | Block любого существующего userId отменяет queue/reservation обоих пользователей, включая чужую пару с третьим участником | [safety.ts:22](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/safety.ts#L22) | A блокирует B; активный offer B–C сохраняется, если они не связаны с A. Block A–B немедленно действует |
| T04 / P1 | contactVote проверяет статус, затем отдельно выставляет ACTIVE; concurrent revoke/block может быть перезаписан задержанным update | [match.ts:255](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/match.ts#L255) | Транзакция/CAS по версии и статусу; конкурирующие consent/revoke/block не возвращают запрещённый edge в ACTIVE |
| T05 / P1 | Проверка членства/block и создание сообщения не атомарны; между ними возможен leave/block | [match.ts:226](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/match.ts#L226) | Определить порядок commit; событие, принятие которого началось после отзыва, не сохраняется/не доставляется. Тест с управляемым interleaving |
| T06 / P2 | sendMessage проверяет ACTIVE без expiresAt. Истечение TTL само по себе не запрещает отправку до opportunistic cleanup | [match.ts:227](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/match.ts#L227) | Управляемое время: после TTL send/rejoin отказаны без предварительного current-запроса |
| T07 / P1 | ContactEdge уникален по паре, но upsert после leave ищет по sessionId. Повторная сессия той же упорядоченной пары вызывает unique conflict; обратный порядок допускает дубликат пары | [schema.prisma](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/prisma/schema.prisma), [leave:249](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/match.ts#L249) | Canonical pair identity отдельно от consent каждого знакомства; второй/обратный матч всегда можно завершить, старое согласие не наследуется молча |
| T08 / P2 | Запоздалый leave старой сессии удаляет reservation по userId, не по offerId; может затронуть новый подбор | [match.ts:250](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/match.ts#L250) | Late leave не меняет новую сессию/резервацию |
| T09 / P2 | История возвращает первые 100 сообщений по asc; новые после сотого пропадут при загрузке. Reconnect не делает гарантированного replay | [match.ts:223, 294](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/match.ts#L223), [App.tsx](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/web/src/App.tsx) | 150 сообщений + disconnect/reconnect: последние доступны, пропусков/дубликатов нет, курсорная пагинация |
| T10 / P1 | expiresAt сообщения — поле, а не удаление. Нет retention/deletion worker, отзыв профиля не завершает очистку данных | [profile.ts](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/profile.ts), [schema](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/prisma/schema.prisma) | Документированный TTL, bounded worker, legal-hold отдельно, тест удаления и восстановления backup без воскрешения удалённого |
| T11 / P1 | Нет production auth/age provider, полного оператора moderation и апелляций | [age-verification.ts](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/age-verification.ts) | Реальный взрослый проходит допуск; отрицательные/сомнительные результаты не допускаются; оператор принимает и разбирает жалобу |
| T12 / P2 | Redis не восстанавливает соединение при `retryStrategy: null`; health не сообщает готовность. Report/block также зависят от Redis | [redis.service.ts](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/redis.service.ts), [health.ts](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/health.ts) | Outage/recovery drill: новый подбор закрыт; выход и фиксация safety-обращения остаются доступны через ограниченный безопасный путь |
| T13 / P2 | Оптимистический UI не доказывает доставку: server отдаёт match.sent event, клиент ожидает другой callback/не обрабатывает все ошибки; HTTP path не делает тот же broadcast | [gateway.ts:46](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/api/src/chat.gateway.ts#L46), [App.tsx](https://github.com/jafarovsamir89/pulse/blob/2c37fb9e561148320c67a9ba71ea16b86f92ca6e/apps/web/src/App.tsx) | Sending/sent/failed явны; retry с тем же id; один контракт HTTP/WS; ошибка не выглядит отправленным сообщением |
| T14 / P1 | Чистая сборка CI не воспроизводится | [CI job](https://github.com/jafarovsamir89/pulse/actions/runs/40240424064/job/121310844086) | Зелёный fresh-checkout CI на точном исправленном SHA; не исключать упавшие проверки |

Дополнительные ограничения: проверка безопасного test DB URL ищет подстроку `127.0.0.1`; требуется строгий разбор hostname/database перед destructive reset. E2E переиспользует состояние между крупными тестами, использует только две identity и не доказывает реальный third-party IDOR. Idempotency-key сообщения не привязан явно к одной session при обработке duplicate: повтор ключа из другой сессии должен отклоняться, а не возвращать старое сообщение новому получателю. В Connections нет законченного UI revoke/report/block и live delivery. CSS alpha не содержит тёмной темы и reduced-motion режима. Общий Nest AppModule и крупный match service допустимы для spike, но границы auth, admission, messaging, consent, safety стоит закрепить до расширения.

## 4. Целевая схема без смены стека

Один репозиторий, модульный монолит и один регион до измеренного ограничения. PostgreSQL — источник истины о допуске, reservation, membership, consent, block, durable message и audit. Redis — короткоживущий presence, rate budgets и транспорт координации; исчезновение Redis не означает исчезновение прав или превращение заблокированного пользователя в допустимого.

Ключевые инварианты:

1. Один пользователь имеет максимум одну активную резервацию/участие в несовместимых событиях; ограничения БД и versioned state transitions проверяются совместно.
2. `eligible(user)` включает auth, возраст, статус, принятые версии правил и ограничения комнаты. Допуск проверяется до выдачи offer, accept и фактического join.
3. Block/ban/revoke — durable transition с событием в transactional outbox; после commit все экземпляры API/WS/RTC получают отзыв. Определить SLA распространения и тестировать задержки, не обещать невозможный нулевой сетевой лаг.
4. Presence имеет heartbeat и TTL, но reconnect не создаёт новую личность и не обнуляет ban. Серверные lease содержат fencing/version, старый worker не освобождает новую reservation.
5. Durable message имеет server id, scoped client id, createdAt, expiry, membership version; ACK только после записи. Клиент хранит bounded cursor, retry идемпотентен, replay после reconnect проходит текущий ACL.
6. Expiry обрабатывает worker с bounded batches и индексами; endpoint не сканирует глобальное состояние при каждом опросе.

Socket.IO по умолчанию даёт at-most-once доставку; порядок пакетов не обеспечивает получение пропущенных событий. Нужны сохранённые id/offset и replay, а не просто reconnect. [Официальные delivery guarantees](https://socket.io/docs/v4/delivery-guarantees). Для нескольких узлов нужен адаптер; при HTTP long-polling также sticky sessions. Redis Pub/Sub adapter не поддерживает connection-state recovery, Redis Streams поддерживает, но это всё равно не заменяет бизнес-проверку прав. [Multiple nodes](https://socket.io/docs/v4/using-multiple-nodes), [recovery](https://socket.io/docs/v4/connection-state-recovery).

## 5. Нагрузочные сценарии, не обещания ёмкости

Общие допущения: один socket на CCU (проверять также ×2 вкладки), 20% пользователей в очереди, current poll каждые 1,5s; 30% отправляют одно текстовое сообщение каждые 20s; 20% подключены к голосу. Это независимые planning assumptions, не результаты load test. Исходящие события зависят от room fanout.

| CCU | Poll RPS нынешнего подхода | Новые сообщения/s | Voice participants | Возможный следующий контур и проверка |
|---:|---:|---:|---:|---|
| 100 | 13,3 | 1,5 | 20 | 1 API + worker, managed PostgreSQL, малый Redis; process restart, восстановление и admission races важнее autoscaling |
| 1 000 | 133,3 | 15 | 200 | 2 API для отказоустойчивости, adapter, connection pooling; измерить p95 latency, DB locks и reconnect burst |
| 10 000 | 1 333,3 | 150 | 2 000 | Event-driven queue вместо клиентского постоянного matching; горизонтальный WS, индексы/пагинация, отдельные workers; RTC quota и региональная задержка |
| 100 000 | 13 333,3 | 1 500 | 20 000 | Когорты закреплены за регионами, региональный admission и capacity control; RTC enterprise/self-hosted planning, отдельная SRE-функция. Ни текущий монолит, ни один тариф не проверены на такую нагрузку |

При очереди только первых 20 кандидатов фильтрация блокировок в памяти может не увидеть подходящего 21-го. «Более сложный алгоритм» это не лечит: нужны индексируемые eligibility-предикаты, честная очередь, bounded retries и отсутствие starvation. Перевод на Redis не отменяет транзакционную резервацию в БД.

Нельзя объявлять «один сервер выдержит N» без конкретных CPU/RAM, payload, TLS, времени жизни сокетов, reconnect и fanout. При 100k socket даже условные 50–150KB на connection означают 5–15GB **только** на connection-related state; это диапазон для измерения, не опубликованный Node benchmark. Load gate: 2× плановый пик на 60 минут, 5× reconnect burst, отсутствие двойного membership/несанкционированной доставки, p95 отправки до durable ACK <500ms в выбранном регионе как целевой SLO. Измерять отдельно client network latency.

## 6. Голос: минуты, сеть и отзыв

Четыре человека × 25 минут = **100 participant-minutes**, а не 25. Для 32kbps аудио одна принимаемая дорожка — около 0,24MB/min без overhead. Две дорожки и 30% overhead — 0,624MB на participant-minute. DTX, число одновременно говорящих, packet loss, TURN и сеть меняют фактический расход; замер обязателен.

На дату доступа LiveKit Ship: $50/месяц, 150k WebRTC minutes, сверх $0,0005/min; 250GB downstream, сверх $0,12/GB. Scale: $500, 1,5M minutes, сверх $0,0004; 3TB, сверх $0,10/GB. Публичные concurrency caps — 1 000 и 5 000 соответственно. Это **transport**, не AI-agent/STT тариф. Расчёт учитывает отдельно подключения и downstream; на больших объёмах нужен договор/quota, а не предположение бесконечной квоты. [LiveKit pricing](https://livekit.com/pricing), проверено 25.10.2026.

Комната на SFU с ограничением 4–6, короткоживущие scoped tokens, server-side mute/kick, отзыв токена и разрешений участника, наблюдаемая стоимость. Не записывать голос по умолчанию. E2EE и серверная модерация содержимого несовместимы без отдельной модели раскрытия; нельзя одновременно обещать невидимый серверу контент и всевидящий автоматический контроль. Для self-hosted RTC нужны TURN/TLS, UDP capacity, room placement, draining и on-call; открытый код не делает эксплуатацию бесплатной. [LiveKit self-hosting](https://docs.livekit.io/transport/self-hosting/).

## 7. Эксплуатационный минимум

| Область | До ограниченного пилота | После доказанного спроса |
|---|---|---|
| API/auth | Реальная сессия, origin/CSRF policy, DTO bounds, per-object ACL, secret management, MFA оператору | Device/session management, risk-based anti-bot без непрозрачной массовой слежки |
| Abuse | New-account лимиты, отдельные safety endpoints, домены/приглашения ограничены, appeals и журнал действий | Калиброванные классификаторы и human review, red-team локальных языков |
| Наблюдаемость | Liveness отдельно от readiness DB/Redis/worker; errors, queue age, report age, revoked-delivery attempts | SLO budgets, tracing без текстов сообщений, региональная сегментация |
| Backup | Зашифрованный backup, доступ отдельно, восстановление в изолированную БД; цель RPO ≤24h/RTO ≤4h для пилота | PITR, цель RPO ≤5min, учения; требования подтверждать бизнесом и провайдером |
| CI/CD | Изолированная test DB, реальные Redis tests, migration compatibility, typecheck/build; ручной release gate | Staging/canary, feature flags, rollback runbook; необратимая миграция отдельно |
| Push/offline | Текстовый reconnect/ACK; напоминание только после согласия, без текста приватного чата на lockscreen | Web Push/Android notification flow, revoked subscription cleanup, дубли/доставка по id |
| Android/PWA | Реальный слабый Android и сеть, Web UX, accessibility; не считать браузерную вкладку установленной PWA | Native shell только после платформенных требований/проверок; crash analytics с редактированием PII |
| Затраты | Quotas на сообщения/комнаты/voice, алерты 50/80/100% бюджета, kill switch новых подключений | Per-cohort margin и автоматический admission по бюджету без разрыва безопасного выхода |

Нельзя логировать токены, текст чата, полные IP и возрастные документы в продуктовую аналитику. Security telemetry хранить отдельно, ограниченно и по обоснованной цели. Удаление из backup требует documented restore suppression, а не обещания мгновенного физического стирания каждой копии.

## 8. Работа с Codex при серверном бюджете

Codex может готовить небольшие патчи, тесты, migrations и runbooks. Основатель остаётся владельцем требований, доступов, выпуска и инцидентов. «Написано AI» не снижает требования к проверке: текущий красный CI показывает практический предел локальной уверенности.

Последовательность ремонта: T14 reproducibility → T01–T08 access/state → T10–T12 lifecycle/safety → T09/T13 delivery/UX → независимый review → только затем closed pilot. Каждый патч на feature branch с конкретным негативным сценарием и свежим CI. Не добавлять огромный набор тестов, зеркалящий код; сначала проверять реальные нарушения инвариантов. Нельзя ослаблять assertion ради green.

Преждевременно: Kubernetes, Kafka, multi-region active-active, собственный SFU, recommendation ML, embeddings интимных разговоров, мобильные клиенты на обе платформы, бесконечная лента. Следующий документируемый инженерный milestone — **два реальных клиента и третий атакующий synthetic client проходят безопасный жизненный цикл**, включая отказ инфраструктуры. Это задача отдельного implementation PR, не данного исследования.
