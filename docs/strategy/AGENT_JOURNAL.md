# PULSE — текущая память руководителя

**Обновлено: 26.10.2026 · G1-L — первая локальная игра работает.** Владелец прямо сменил приоритет на играбельный прототип. На 038bce3 / PR №3 реализованы приглашение, двое, 6 скрытых answer/guess раундов + общий 7-й финал, очки, реакции, skip, mutual rematch и восстановление. Пройден весь матч в двух UI-вкладках; pnpm verify, 31 API E2E, 16 unit и оба clean CI PASS. Прототип открыт на http://localhost:5317/. Это локальный playtest, P01/production gates ещё открыты.

## Мандат и предпочтения владельца

Владелец назначил Codex генеральным директором/руководителем проекта: думать как создатель, самостоятельно формировать идеи, решения и приоритеты. Не перекладывать обычные продуктовые решения обратно. Ответственность — согласованный продукт, инженерное качество и проверяемая экономика. Общение на русском. Пределы внешних действий — в AGENTS.md; назначение не разрешает автоматически тратить деньги или публиковать продукт.

Владелец выбрал **весёлую вечеринку**, а не интеллектуальный турнир. Попросил Party оформить коротким дополнением без массовой переработки; выполнено U04.

Последнее прямое указание: пользователь недоволен отсутствием игры; подтвердил «делай» для первой «Угадай меня» (ссылка → двое → 7 раундов → финал → реванш). Этот приоритет выполнен, не возвращаться автоматически к бесконечному ремонту alpha, скрывая игровой результат. Для публичного пилота engineering/admission gates по-прежнему обязательны.

## Что строим

**Приходи за игрой, возвращайся к своим.**
- G1: дуэт «Угадай меня», 7 раундов, скрытые ответы/прогнозы, общий финал, текст, добровольный повтор.
- G2: 3–4 участника; новый кандидат PULSE Party — команды 2×2, «Верю — не верю», «Собери картину», «Поймай нашу волну», общий финал.
- G3: добровольные круги ≥3 и повторная игра. G4: проверенные расширения.
- Party voice: внутри раунда своя команда, между раундами общий разговор; opt-in, текстовая альтернатива, после voice gate.
- Rematch, remeet и contact/DM — отдельные согласия. Нет paid attention, fake users, обидных титулов/рейтинга человека.
- Руководитель выбрал русский как рабочее допущение первого языка; доступная когорта/рынок этим не доказаны. Перед пилотом проверить реальную возможность набора, не считать Баку подтверждённым рынком.

## Где работа и что реально есть

- Основной checkout: /Users/macbookair/Documents/domino/PULSE, ветка codex/g1-playable, HEAD 038bce3; [играбельный прототип PR №3](https://github.com/jafarovsamir89/pulse/pull/3), stacked на PR №1 / codex/sprint-1-foundation-text-match 1f8bde0. Не переключать checkout обратно на alpha, если владелец хочет смотреть игру.
- Документационный worktree: /Users/macbookair/Documents/domino/PULSE/.tmp/genesis-strategy, ветка codex/project-genesis, открытый [PR №2](https://github.com/jafarovsamir89/pulse/pull/2).
- Последний проверенный main: 47d5756 (game-first v0.3); актуальность повторно проверить перед кодом.
- v0.4 основной commit 20ec1e9; handoff 2841e9e; Party supplement 0c3147d; мандат U05 опубликован commit 0c78342. Финальная запись handoff может быть следующим docs commit; точный HEAD брать из git log.
- В main/стратегической ветке нет готовой игры. Исходный аудит T01–T14 относится к SHA 2c37fb9. P01-A на a099dda исправил T01/T06/T08/T14; P01-B на 34ccd58 — T02; P01-C на 1f8bde0 — T03. Остальные замечания открыты. Исторический аудит не переписывать как текущий результат.
- G1-L в PR №3 содержит отдельный LocalGameRoom/state machine + server projections, 24 draft card, новый web и launcher. Контакты/DM/старый matchmaking не используются. Source docs: docs/G1_LOCAL.md, README; прежний UI сохранён в ?alpha=1. Миграция нового game table применена только к local pulse_local/pulse_test на 55479.
- 16 основных документов и 12 отчётов согласованы; Genesis v1 сохранён в docs/archive/genesis-v1 с SHA manifest.
- В основном checkout дополнительно оставлена локальная копия AGENTS.md для автоматического старта с правилами, пока PR №2 не merged. Она намеренно untracked на alpha ветке; источник — AGENTS.md стратегической ветки. Не потерять и не перезаписать пользовательские правки при будущем объединении.

## Последние доказательства

U03: оба research-tests PASS на 20ec1e9; в чате также проверены PASS на 2841e9e. Это старый spike, не alpha acceptance.
Validator v0.4: 162 local links, 19 archive hashes, 12 сценариев + 12 sensitivity, deterministic outputs — PASS.
U04: короткое Party-дополнение, git diff --check PASS; без повторных app/finance tests.
U05: проверять только AGENTS/память/ссылки и scope; финансовая модель и приложение не меняются. Конкретные команды — в WORK_LOG.

P01-A на a099dda: `pnpm verify` PASS (11 API unit, spike, lint/types, API/web build); 7 API integration PASS. Новые T01/T06/T08 сначала дали 3 FAIL на 2c37fb9. Clean CI [PR](https://github.com/jafarovsamir89/pulse/actions/runs/40413022741) и [push](https://github.com/jafarovsamir89/pulse/actions/runs/40413016540) PASS, оба research-check PASS. Redis mocked в API integration; web/contracts без собственных тестов, bundle warning сохраняется. Evidence локально: `.tmp/p01-evidence/` основного checkout.

P01-B/C на 1f8bde0: `pnpm verify` PASS, 25 real DB/API/socket E2E PASS. T02 сначала 8 FAIL на a099dda, T03 сначала 5 FAIL на 34ccd58; проверки не ослаблены. Последний clean CI [PR](https://github.com/jafarovsamir89/pulse/actions/runs/40414805438) и [push](https://github.com/jafarovsamir89/pulse/actions/runs/40414796849) PASS, оба research-check PASS. Evidence `.tmp/p01-b-evidence/` и `.tmp/p01-c-evidence/`. Redis mocked; delivery проверен для одного API, distributed invalidation и нагрузочная ёмкость не доказаны. Ранее поставленный в сеть пакет нельзя отозвать; после commit нового enqueue с отозванным доступом нет.

G1-L на 038bce3: `pnpm verify` PASS; 31 API E2E / 5 suites, 16 API unit / 4 suites. Clean CI [PR](https://github.com/jafarovsamir89/pulse/actions/runs/40418207653) и [push](https://github.com/jafarovsamir89/pulse/actions/runs/40418166923) PASS; оба research-check PASS. UI в IAB прошёл все 7 раундов, общий финал 6/6, mutual rematch и reload сохранённого выбора. Evidence `.tmp/g1-evidence/`, в том числе reveal.png/results.png/welcome.png. Это синтетическая проверка агентом, не пользовательские испытания.

Живой launcher `pnpm dev:game`: retained exec session 71229, web http://localhost:5317/, API 127.0.0.1:3107, Postgres 127.0.0.1:55479/pulse_local, Redis URL 127.0.0.1:6389 (для игры Redis не используется). Tab 4 markDeliverable на стартовом экране; тестовая guest tab 5 закрыта. Если процессы исчезли, запуск из docs/G1_LOCAL.md. Не печатать .env/credential: токен игрока остаётся в sessionStorage вкладки.

## Что неизвестно / не делать вид, что решено

Подтверждены Codex для разработки, наличие серверного бюджета и 18+. Неизвестны сумма cash cap, доступная взрослая когорта, часы человека/резерв, страны/age route, редактор/reviewer и готовность платить. Продуктовых интервью/игровых тестов ещё не проводили. Не обещать миллион пользователей или прибыль.

## Точное продолжение

G1-L готов для владельца локально. При следующем обращении сначала использовать фактическую игру и его UX feedback; не отвечать, что игры ещё нет. Не повторять создание движка/полный аудит/документальную стратегию. Полный мобильный/browser/a11y run, независимый review карточек, реальные playtests и production admission не выполнены. LOCAL_GAME_ENABLED запрещён в production; текущий API только loopback, поэтому ссылка работает на этой машине. Не публиковать обход age gate.

Если продолжать engineering foundation, открыты **T04/T05** (consent resurrection и запись сообщения между ACL check и leave/block/expiry), T07 и T09–T13. Старые замечания не исчезли из-за изолированной игры. P01-A/B/C и G1-L находятся в отдельных открытых PR №1/№3, без merge/deploy; стратегия/журналы — PR №2. Перед pilot game интеграцией их надо согласовать с актуальным main. Не возвращать Text Match-first из старой alpha.

Ручные P02/P03 (24 карточки, 10 интервью, 10–20 сессий) можно готовить параллельно инженерному основанию в рамках соответствующего поручения; не заявлять, что участники уже набраны. Родительский Domino и его пользователи — другой проект.

После каждого значимого этапа обновить эту сводку и дописать WORK_LOG. Не начинать новый большой отчёт вместо продолжения с этой точки.
