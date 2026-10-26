# PULSE — технический аудит и переход к game-first v0.4

**25.10.2026.** Main 47d5756 содержит документацию, исторический prototype/spike и игровую концепцию. Alpha в [PR №1](https://github.com/jafarovsamir89/pulse/pull/1) проверялась на SHA 2c37fb9e561148320c67a9ba71ea16b86f92ca6e. Код в данном документационном PR не исправляется.

## 1. Реальное состояние и прежние доказательства

Полезное основание: React/Vite, NestJS, PostgreSQL/Prisma, Redis limits, Socket.IO, queue/offer/session, contact/DM, базовые safety API. Только synthetic dev auth; production admission/полные operations отсутствуют. GameEngine/secret answers/rounds/score ещё нет.

Локально ранее открылись главная и Connections, поиск вернул 503 при недоступном Redis; [снимки](UX_GAME_DESIGN.md). CI verify на указанном SHA упал из-за Express/types и генерации Prisma. Эти результаты не выдаются за проверку будущих исправлений. Зелёный research-tests этой документационной ветки проверяет только старый spike.

## 2. Что сохраняем и что добавляем

Сохраняем стек и модульный монолит; исправляем проверенные инварианты прежде расширения. Добавляем GameEngine/Content/Continuation на общем admission и membership, а не независимую вторую систему auth/contacts.

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

## 4. Новые риски GameEngine

До реализации определить private/public snapshots; expectedVersion и commandId; immutable card version; серверный deadline; row-lock/CAS для answer, reveal, score и end; outbox после commit. Проверять секреты в ошибках, логах, reconnect, host UI и аналитике.

G1: шесть основных раундов + общий финал; retry не второй голос, skip не проигрыш, timeout не случайный ответ. Rematch создаёт новый game ID. Три согласия разделены и отзываются без resurrection. [Полная архитектура](../ARCHITECTURE.md).

## 5. CCU-сценарии, не результаты benchmark

Для иллюстрации: 70% CCU играет; 12 private input commands на игрока за 8 минут (6×answer+guess); 30% CCU отправляет сообщение раз в 20 секунд. Финал/ready/reactions/replay добавляются сверх таблицы.

| CCU | Игровых input commands/s | Chat messages/s | Что исследовать |
|---|---:|---:|---|
| 100 | 1,75 | 1,5 | Один API, DB/Redis, реальные жизненные циклы |
| 1 000 | 17,5 | 15 | DB locks/pool, memory, disconnect burst |
| 10 000 | 175 | 150 | Несколько API, adapter/outbox, indexes, hot rooms |
| 100 000 | 1 750 | 1 500 | Региональные/capacity решения, очереди, стоимость, организация |

Одновременный reveal после общего deadline создаёт burst, который среднее скрывает. Нагрузочный профиль должен включать синхронный ввод, массовый reconnect, медленных получателей и moderator actions. 100k CCU не выводится из 1M MAU; только фактическая session intensity даёт связь.

Voice считать participant-minutes, фактические audio subscriptions и TURN. Тарифные concurrency caps/enterprise quotes отдельно от unit price. [Модель](BUSINESS_MODEL.md).

## 6. Порядок и приёмка

P01: clean CI → T01–T08 → T10–T12 → T09/T13, с учётом риска и зависимостей. T14 не заменяет остальные. Независимый review критичных изменений; synthetic local DB/API/Redis, строгий URL parse вместо подстроки.

P04: два реальных браузера + третий атакующий synthetic subject, deterministic state tests, реальные transactions и управляемые гонки; ACK/replay >100 сообщений; timeout/restart/ban/logout/delete/block. P05: человек/age route/удаление/restore/инцидент. Только затем живой пилот.

Не вводить Kubernetes/Kafka/ML matching/собственный SFU/3D/две native платформы до нужды. Voice, платежи и публикации — отдельные пакеты. Не ослаблять тесты ради green; фиксировать новый SHA и evidence, сохранять исходные сбои.
