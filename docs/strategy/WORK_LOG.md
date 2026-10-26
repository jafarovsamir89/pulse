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
