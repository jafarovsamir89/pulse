# PULSE — append-only журнал v0.4

## 2026-10-25 · U01 · объединение концепции

- Запрос владельца: объединить обе идеи, профессионально переработать game design, изменить все документы и бизнес-план.
- Ветка codex/project-genesis, существующий PR №2. Исходный checkout alpha оставлен нетронутым.
- Fetch origin: main обновился с 7b64b57 до 47d5756; добавлен game-first v0.3. Merge в аналитическую ветку без конфликта.
- Сохранены все 19 файлов прежнего Genesis в docs/archive/genesis-v1; SNAPSHOT_SHA256.json для проверки неизменности.
- Новая стратегия: игра как первая ценность, повторная компания как развитие; G1/2/3/4, отдельные согласия, invite-first + обеспеченные stranger-окна.
- Проверены первичные страницы Plato/Hago/WePlay/TopTop/Spin the Bottle. Категория games+chat уже существует; рыночная уникальность не заявляется.
- Обновляются README/PRD/roadmap/TODO, GDD/content, architecture/safety/metrics, финансовые сценарии и все активные strategy reports.
- Модель v0.4: host + cosmetic revenue, refunds, completed matches/participations, редактура, человеко-часы, 12 сценариев + 12 sensitivity. Первый прогон проходит арифметику/units/directional checks.
- Первая большая запись русскоязычных файлов через shell завершилась ошибкой UTF-8 до записи файлов; повтор через ASCII-escaped JSON успешен. Исходники не затронуты.
- Нерешённое: продуктовые тесты, фактические бюджеты/quotes, admission, human operations, T01–T14 alpha.

## 2026-10-25 · U02 · согласование и проверка

- Канонические core docs и все 12 активных strategy reports приведены к v0.4; новый GDD/контентный процесс, P00–P15 и D-020–D-029. Старые D-013/D-017 явно заменены, история сохранена.
- Пять прямых игровых конкурентов добавлены; старые факты/20 отзывов/3 обсуждения сохранены как свой корпус, новые игровые отзывы не выданы за репрезентативную выборку.
- Финансовая модель не подгонялась под прибыль: base 1M ≈ −675 523 USD/month; optimistic ≈ +135 724, при fee30 ≈ +37 848; все значения условные. Voice=0 отменяет тариф.
- python3 docs/strategy/validate_docs.py — PASS: 16 core docs, 12 reports, ровно 10 improvements, 18 founder answers, 28 risks, 162 локальные ссылки на этом прогоне, 19 неизменённых архивных файлов, deterministic output. Model identities/units и directional checks PASS.
- git diff --check — PASS. Поиск старых R7/R28/приоритета D/4–6 оставил только явно исторические/исследовательские упоминания. UTF replacement symbols отсутствуют.
- Основной checkout /Users/macbookair/Documents/domino/PULSE: чистый, HEAD 2c37fb9; он не переключался и не менялся. Production/миграции/live data/Android не тронуты.
- Приложение заново не тестировалось ради документов. Результаты PR №1 не улучшены этим пакетом; следующий P01 отдельно. Исходный дефектный аудит сохранён в текущем TECHNICAL_REVIEW и архиве.
- Пакет готов для commit/push и обновления существующего PR №2 под весь конечный scope; без merge.

## 2026-10-25 · U03 · публикация и handoff

- Commit 20ec1e9b1b6f2ba0e2645bfd41b3b3b3c56ba313 опубликован в codex/project-genesis. PR №2 переименован и описание полностью обновлено под v0.4; артефакт прикреплён к чату. PR open/mergeable, не merged.
- Оба research-tests PASS на этом SHA: [push](https://github.com/jafarovsamir89/pulse/actions/runs/40255174584/job/121355362171), [pull request](https://github.com/jafarovsamir89/pulse/actions/runs/40255177535/job/121355371134). Это старый spike, не alpha acceptance.
- Финальный validator: 162 local links, все 19 archive hashes и deterministic financial outputs PASS. Diff ограничен документацией, аналитическими моделями/валидатором и сохранёнными иллюстрациями. Worktree после публикации чистый до этой записи handoff.
- Следующий шаг: отдельный P01 ремонт alpha; не приступать автоматически к production или игре до engineering scope. Для PR №1 потребуется согласование его старых документов с v0.4 при будущем объединении.

## 2026-10-26 · U04 · короткое дополнение PULSE Party

- Владелец выбрал весёлую вечеринку и попросил быстро добавить дополнение без пересмотра всех документов.
- В PULSE_GAME_SOCIAL_EXPANSION.md добавлены автоматические команды 2×2, три типа раундов, opt-in командный/общий голос, автоматический ведущий, общий финал и добровольный повтор. Режим — кандидат G2; G1 и voice safety gate сохранены.
- Ветка codex/project-genesis, PR №2 открыт. git diff --check PASS; изменения прочитаны. Полные проверки приложения и финансов не повторялись: они не затронуты. Обновлён короткий journal, следующий шаг P01 без изменений.

## 2026-10-26 · U05 · мандат руководителя и восстановление памяти

- Прямой запрос владельца: зафиксировать назначение Codex генеральным директором/руководителем в AGENTS.md и постоянно вести дневник для восстановления контекста.
- Создан корневой AGENTS.md стратегической ветки: самостоятельные продуктовые решения, русский язык, границы действий, обязательный порядок восстановления, короткий snapshot и append-only история.
- AGENT_JOURNAL.md обновлён как актуальная компактная сводка: мандат, Party, состояние двух checkout/PR, проверенные SHA, неизвестные ресурсы и точное продолжение P01. Старые решения/проверки сохранены в этом WORK_LOG и Git.
- В основном checkout alpha создана идентичная локальная untracked копия AGENTS.md, чтобы следующий запуск из cwd читал инструкции ещё до merge PR №2; она направляет к найденному через git worktree list актуальному журналу. Приложение/ветка alpha не менялись, но корневой checkout теперь намеренно показывает ?? AGENTS.md.
- Ветка codex/project-genesis, исходный HEAD 0c3147d. Изменения ограничены AGENTS.md и двумя файлами памяти; не меняют scope продукта/платежи/production.
- Проверка этого этапа: существование целей восстановления в актуальном worktree, равенство двух AGENTS.md, git diff --check и diff scope. Никакого повторного большого app/financial test run.
- Следующее действие: commit/push U05 в существующий PR №2; при продолжении инженерной работы — P01, с обязательным обновлением двух журналов после milestone.

### U05 — результат публикации

- Commit 0c78342 опубликован в codex/project-genesis / PR №2. Проверка ссылок восстановления, идентичности двух AGENTS.md и git diff --cached --check — PASS. Стратегический worktree чистый после push; основной checkout содержит только ожидаемый untracked AGENTS.md.
- Короткий журнал обновлён с выполненным статусом U05 и следующим P01; не оставлять инструкцию повторно публиковать уже отправленный мандат. Новых app/CI результатов этим шагом не заявляем.

## 2026-10-26 · P01-A · первый инженерный пакет

- Продолжение по вопросу владельца «что теперь директор?»: решение руководителя — начать с ограниченного проверяемого ремонта alpha, затем продолжать P01 и G1.
- Ветка codex/sprint-1-foundation-text-match / PR №1, исходный SHA 2c37fb9. Родительский Domino не затронут.
- Новые реальные DB/API/socket регрессии T01/T06/T08 сначала упали: outsider leave дал 201 вместо 403; expired send дал 201 вместо 403; late leave оставил 1 из 2 резервов новой встречи. Evidence: основной checkout .tmp/p01-evidence/red.log.
- Исправлены membership при leave, TTL при send, удаление резервов строго по offerId. Все 7 интеграционных тестов PASS (.tmp/p01-evidence/green-e2e.log). Синтетические identity; PostgreSQL 127.0.0.1:55479/pulse_test; Redis provider в интеграционных тестах подменён, его надёжность этим не проверена.
- Усилена проверка test DB URL (точный hostname/path/protocol, без переопределения host через query); добавлены 7 unit cases. .env и токены не выводились.
- T14 исходный CI 40240424064 подтверждает missing express/types и негенерированный Prisma client. Локальный typecheck до исправлений проходил из-за имеющегося окружения — это не clean-install доказательство. Добавлены express/types в manifest/lockfile и явный db:generate в CI; pnpm add выполнен один раз для каждой зависимости.
- Следующее действие: закончить pnpm verify, опубликовать ограниченный кодовый пакет и проверить CI именно нового SHA. P01 целиком не закрыт; T02–T05/T07/T09–T13 остаются. После milestone обновить короткий журнал.

### P01-A — результат и точка продолжения

- Кодовый commit a099dda79bcda8bbb7590bf4427ea2e84dfe5546 опубликован в PR №1; PR body обновлён под конечный scope и открытые риски, PR прикреплён к чату. Merge/deploy не выполнялись.
- Изменены apps/api/src/match.ts, apps/api/package.json, pnpm-lock.yaml, .github/workflows/ci.yml; добавлены session-boundaries.e2e-spec.ts, local-database.ts, local-database.spec.ts; общий E2E использует строгую проверку DB URL.
- pnpm verify PASS: lint/typecheck, 11 API unit, spike, API/web build. Все 7 E2E PASS. git diff --check PASS. Команда запуска E2E: PULSE_TEST_DATABASE_URL=postgresql://macbookair@127.0.0.1:55479/pulse_test DATABASE_URL=postgresql://macbookair@127.0.0.1:55479/pulse_test REDIS_URL=redis://127.0.0.1:6379 NODE_ENV=test DEV_TEST_AUTH_ENABLED=true pnpm --filter @pulse/api test:e2e. На этапе red добавлялся --testPathPattern=session-boundaries.
- Чистые CI на a099dda PASS: PR https://github.com/jafarovsamir89/pulse/actions/runs/40413022741 и push https://github.com/jafarovsamir89/pulse/actions/runs/40413016540. Оба включали frozen install, Prisma generate, миграцию изолированной CI service DB, lint/types/tests/E2E и обе сборки. Оба research-tests также PASS.
- Evidence: .tmp/p01-evidence/{red.log,green-e2e.log,verify.log,ci-watch.log} в основном checkout; журналы/исторический аудит сохраняют выводы независимо от временных логов. Локальный typecheck до исправлений был PASS, clean CI старого SHA FAIL: не смешивать эти результаты.
- Ограничения: API E2E подменяет Redis allow; web/contracts имеют 0 собственных тестов; bundle 615 kB с предупреждением; гонка между проверкой TTL и записью относится к открытому T05. Публичная готовность не заявлена.
- Основной checkout после commit содержит только намеренный ?? AGENTS.md. Стратегический PR №2 получает обновление двух журналов; продукт/финансы/архивы не менялись, полный валидатор документов не повторялся.
- Точное продолжение: T02 — тесты для stale joined socket после logout, expiry, suspension и deletion, затем решение по revocation/private delivery. Далее T03–T05/T07/T09–T13, и только после gates настоящий G1. P01 целиком открыт.

## 2026-10-26 · P01-B / T02 · отзыв доступа и приватная доставка

- Прямое поручение владельца: «делай», продолжение P01. Ветка codex/sprint-1-foundation-text-match, исходный SHA a099dda; PR №1 открыт, состояние перепроверено.
- Новые 8 реальных API/DB/socket регрессий сначала дали 8 FAIL на a099dda: logout нескольких вкладок, пропущенный revoke/expiry/suspension/age-denied, deletion, moderator suspension, idle auth expiry. Evidence: .tmp/p01-b-evidence/red.log основного checkout. Исходный аудит не переписан.
- Добавлен RealtimeAccess: локальный реестр подключений по hash токена/пользователю, таймер auth expiry, закрытие после commit logout/deletion/suspension. Room broadcast заменён проверкой каждого получателя, включая match.closed. Текущие auth/user/member/session/block проверяются в БД; ошибки авторизации/DB приводят к disconnect без отправки payload.
- Для гонки revoke/delivery выбран read-lock user → auth → member → match session; синхронный emit выполняется внутри короткой read-транзакции. Внешняя отправка уже разрешённого пакета клиенту может завершиться после отзыва: отменить сетевой пакет, поставленный в очередь до commit, невозможно. Новое enqueue после commit запрещено; durable replay/ACK не входит в T02.
- Проверены актуальные первичные Socket.IO server API и Prisma v6 transactions через Context7; новых зависимостей/плагинов/миграций нет. Обычный singleton API, без multi-node adapter: межпроцессный push-invalidation не реализован; повторная DB-проверка остаётся обязательной перед доставкой.
- Дополнительно 3 теста: реальная блокировка auth row незавершённой транзакцией revoke (pg_blocking_pids подтверждает ожидание доставки), fail-closed при инъекции DB error, фильтрация match.closed. Полный E2E PASS: 18 сценариев / 3 suites. Redis allow в E2E по-прежнему подменён.
- Evidence: .tmp/p01-b-evidence/green-revocation.log (первые 8 PASS), green-e2e.log (18 PASS); локальные endpoints как в P01-A. Полный pnpm verify выполняется, затем code commit/push и CI конкретного нового SHA.
- Открыты T03–T05/T07/T09–T13. Ближайший после T02 — T03: блокировка A→B не должна отменять независимые queue/offer/session B↔C. Не объявлять P01 или G1 готовыми.

### P01-B — результат публикации

- Commit 34ccd58db3a7d47c86cd5d18d4fdd6f5c691ad9c опубликован в PR №1. pnpm verify PASS; 18 E2E PASS; git diff --check PASS. Изменены app.module/auth/chat.gateway/match/profile/safety; добавлены realtime-access.ts и socket-revocation.e2e-spec.ts. Новых package dependencies и миграций нет.
- Clean CI PASS на этом SHA: PR https://github.com/jafarovsamir89/pulse/actions/runs/40414375498 и push https://github.com/jafarovsamir89/pulse/actions/runs/40414370510; оба research-check PASS. T02 закрыт для текущего единственного API процесса; нагрузочная оценка row-lock delivery и межпроцессное push-invalidation остаются будущей эксплуатационной работой.

## 2026-10-26 · P01-C / T03 · границы блокировки

- Начат после T02 без ожидания несвязанных внешних проверок. Исходный SHA 34ccd58, та же feature branch/PR №1.
- Пять новых real DB/API тестов сначала FAIL: блокировка снимала waiting slots, отменяла queue/reservations других пар и при повторе ломала новое приглашение. Evidence: .tmp/p01-c-evidence/red.log.
- SafetyService.blockPair теперь изменяет offers/reservations/sessions/contacts только общей пары. Waiting slots сохраняются для других кандидатов. OFFERED queue rows отменяются лишь при фактической отмене pending offer этой пары. Idempotent повтор не трогает новый B-C offer.
- Список закрываемых сессий читается в той же Serializable транзакции; P2034 имеет до двух retries без повторного списания rate limit. Это согласовано с существующими Serializable matching/acceptance.
- Добавлены две гонки accept/block с обеими ориентациями offer: конечное состояние CANCELLED либо BLOCKED, без активных резервов; независимая C-D пара сохранена. Полный E2E PASS: 25 сценариев / 4 suites. .tmp/p01-c-evidence/green-block.log и green-e2e.log, endpoints/Redis mock как P01-A.
- Полный pnpm verify выполняется перед отдельным commit/push и CI. Следующий инженерный приоритет T04/T05 (consent resurrection и конкурентная запись сообщений), затем T07/T09–T13. P01 и игра ещё не готовы.

### P01-C — локальный результат и публикация

- Commit 1f8bde0165c19415511b11e8326901e2e9555d02 опубликован в PR №1; изменены только safety.ts и новый block-scope.e2e-spec.ts. Полный pnpm verify PASS, полный E2E 25/25 PASS, git diff --check PASS. Результат E2E сохранён в .tmp/p01-c-evidence/green-e2e.log, verify — в verify.log.
- PR №1 body переписан под конечный scope P01-A/B/C, с доказательствами red→green, ограничениями single-process/Redis mock и открытыми T04/T05/T07/T09–T13. Последний CI ещё выполняется, не подменять его успешным CI предыдущего SHA.
- Основной checkout после двух focused commits содержит только намеренный ?? AGENTS.md; стратегический worktree меняет только два журнала. Production, миграции, кошельки, родительский Domino и внешние сообщения не затронуты. Автономное продолжение P01 не означает разрешения production.

### P01-B/C — финальный handoff

- На последнем SHA 1f8bde0165c19415511b11e8326901e2e9555d02 оба verify PASS: PR https://github.com/jafarovsamir89/pulse/actions/runs/40414805438/job/121894310489 и push https://github.com/jafarovsamir89/pulse/actions/runs/40414796849/job/121894284062. Оба research-tests также PASS. gh pr view подтвердил headRefOid и открытый PR; merge не выполнялся.
- Короткий journal обновлён: T02/T03 закрыты в текущем single-process scope; T04/T05/T07/T09–T13 открыты. Следующее конкретное действие — детерминированная регрессия contactVote между последним положительным голосом и переводом PENDING→ACTIVE при конкурентном revoke/block; затем атомарный переход и send race. G1 пока отсутствует, пользовательских испытаний не было.
- Передача двух журналов в существующий стратегический PR №2; diff --check PASS. Перепроверять green CI без новых изменений не требуется. Секретов, новых зависимостей или schema migrations в P01-B/C нет.

## 2026-10-26 · G1-L · прямое изменение приоритета владельцем

- Владелец уточнил, что ждёт играбельный прототип, а не дальнейшие страницы/серверные отчёты; подтвердил «делай» для локальной «Угадай меня»: ссылка → двое → 7 раундов → общий финал → реванш.
- Приоритет изменён напрямую пользователем: G1-L выполняется сейчас, T04/T05/T07/T09–T13 остаются открытыми; не подменять их статус новым прототипом. Новая feature branch codex/g1-playable от 1f8bde0, основной checkout, существующий untracked AGENTS сохранён.
- Выбран локальный invite-only прототип в существующих React/Nest/Postgres. Отдельные bearer credentials участников на вкладку, server-only secret state, row-locked game transitions, persisted room; без связывания с неисправленным contact/DM. LOCAL_GAME_ENABLED + запрет production/нелокальных клиентов, self-declared 18+ честно не выдаётся за проверку возраста.
- Применён Sites skill только local-only workflow; существующие dependencies, новая Site registration/publication не выполняются. Проверить настоящее прохождение в двух UI-клиентах, не ограничиваться сборкой.

### G1-L — реализация и проверка

- Commit 038bce34cf4c4761e4a51f7cd833efff914ec75c опубликован в codex/g1-playable; создан и прикреплён PR №3 https://github.com/jafarovsamir89/pulse/pull/3, stacked base codex/sprint-1-foundation-text-match (PR №1). Merge и публичный deploy не выполнялись.
- Добавлены game/cards.ts (24 оригинальных draft card), engine.ts (server state machine/projection), local-game.ts (loopback/non-production guard, per-tab bearer, locked room transactions), shared game types, LocalGameRoom Json и одна миграция. Миграция применена только к 127.0.0.1:55479/pulse_local и /pulse_test. Ни существующие alpha таблицы, ни production не мигрировались.
- Web теперь открывает настоящую игру: create/join/ready, скрытые answer/guess, совместный reveal, 7-й финал, индивидуальный score, реакции, skip, slower pace/extension, presence pause, взаимный rematch. Старый App сохранён как TextMatchAlpha в lazy route ?alpha=1. Новый экран/24 карточки — локальные черновики, без выдачи за независимый editorial review.
- Snapshot не содержит token hashes, чужих скрытых answers/guesses или будущей колоды. Очки не раскрывают правильность до reveal. Command gameId/roundId/version и bounded 200 receipts запрещают повторный эффект и старые раунды; повтор версии UI обрабатывает тем же command ID. Rematch меняет gameId и выбирает свежие карточки относительно прошлой партии.
- pnpm verify PASS (16 API unit, spike, lint/types, API/web builds); все 31 API E2E PASS. Новые 6 DB/API сценариев проходят весь матч/score/rematch, outsider/third player, concurrent version conflict/retry, idempotency/payload conflict, persisted projection, expiry и production gate. 5 unit state-machine cases: privacy, timeout/pause/end, skip, invalid phase/option, extension/slow/leave. Не ослаблялись предыдущие 25 E2E.
- Первое typecheck выявило отсутствие types entry у shared package при Node moduleResolution API; исправлено packages/contracts/package.json, повторные typecheck/verify PASS. Сборка фактически пишет dist/src/main.js: start исправлен и compiled API /health проверен, временный процесс остановлен.
- Launcher pnpm dev:game проверен на 5327/3117: generate + локальная миграция + API/Vite стартуют; API слушает 127.0.0.1. Ctrl+C остановил оба дочерних сервера, порты освободились. Remote DB URL отклонён до подготовки. Итоговый preview перезапущен этим launcher на 5317/3107; живой retained exec session 71229, лог .tmp/g1-evidence/live-preview.log. Для пользователя серверы намеренно оставлены работать. Старые процессы 3000/5173 не трогались.
- Browser QA: независимые вкладки 4/5 в IAB, синтетические Лира/Север; приглашение, готовность, 6 обычных раундов с разными ответами и точными прогнозами, 7-й совместный выбор, одинаковая история/6 из 6, mutual rematch (свежие вопросы), сохранение выбранного ответа после reload, затем честное timeout завершение оставленного тестового rematch. После перезапуска API старая комната сохранилась. Guest tab закрыта, tab 4 оставлена на localhost:5317 и markDeliverable. Это проверка агентом, не реальное пользовательское интервью.
- CUA Playwright ожидание кнопки после 3-секундного reveal несколько раз упиралось в CDP timeout; свежий AX показывал нормальный DISCUSSION и доступную кнопку, проверка продолжена обычным кликом. Ошибка инструмента не выдана за баг игры или исключённый тест.
- Evidence в основном checkout: .tmp/g1-evidence/{game-e2e.log,all-e2e.log,unit.log,verify-final.log,launcher.log,compiled-api.log,rejected-remote.log,reveal.png,results.png,welcome.png}. Browser/mobile resize capability отсутствует: отдельный мобильный visual run не заявляется. CSS responsive/reduced motion есть; полной accessibility matrix нет. Web bundle warning ~518 kB сохраняется, Redis в API integration mocked.
- Новых dependency installs не было. В launcher local-only DB endpoints, feature disabled по умолчанию, production/non-loopback requests запрещены; self-declared adult не заменяет age provider. Нет свободного чата/DM/голоса/рандомных незнакомцев и подключения к открытым T04/T05/T07 alpha paths.
- Ожидается clean CI последнего SHA, затем финализация журналов. Рабочий результат уже открыт; последующие задачи — UX по фактической игре и отдельные production gates, не повторный большой отчёт вместо игры.

### G1-L — финальный результат

- Clean CI конечного 038bce34cf4c4761e4a51f7cd833efff914ec75c PASS: PR https://github.com/jafarovsamir89/pulse/actions/runs/40418207653/job/121905727205 и push https://github.com/jafarovsamir89/pulse/actions/runs/40418166923/job/121905592854. Оба research-tests PASS. Запуск/фактическое 7-round UI прохождение не подменены этим CI.
- Рабочий preview после перезапуска слушает только 127.0.0.1:3107/5317, /health и web HTTP200 подтверждены. Старый game room сохранился после перезапуска API. Стартовый экран открыт в IAB tab 4, markDeliverable; тестовая вторая вкладка закрыта. Скриншот финала results.png содержит настоящую пройденную синтетическую партию, welcome.png — текущий вход.
- Короткий журнал обновлён под новую ветку/PR, работающую G1-L и прямой приоритет владельца. Не оставлять устаревшее «G1 отсутствует» как текущее состояние. Производственная готовность и реальные playtests не заявлены. P01 остаётся незавершённым.
- Рабочий checkout чистый кроме ожидаемого untracked AGENTS.md; журналы публикуются в существующий PR №2. Новых пакетов/плагинов и действий в родительском Domino не было.
