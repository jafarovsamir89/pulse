# PULSE — TODO v0.2

**Актуальное направление:** близкий Litmatch-подобный функционал, но исходная первая вертикаль — **Text Match 1:1**, а не календарные мероприятия. **Никакого production приложения ещё нет.** IDs из v0.1 сохранены только в git history; текущая очередь задач ниже — новая.

## P0 — рабочая безопасная Text Match alpha
- [x] Документация v0.1, прототип и spike группового подбора (исследовательские артефакты).
- [x] Product pivot v0.2, PRD, Litmatch feature matrix, обновлённый roadmap/Codex brief.
- [ ] T-001 Сформировать 15–25 интервью, выбор стартового языка/часов и команды модерации.
- [x] T-002 Доработать Web UX: Text Match, ожидание, короткий чат, взаимный контакт, жалоба.
- [x] T-003 Создать monorepo `apps/web`, `apps/api`, `packages/contracts`, `infra/compose.yaml`; CI.
- [ ] T-004 Auth и серверный возрастной допуск 18+; провайдер проверки, dev login *только dev*, privacy/terms.
- [ ] T-005 Профиль: псевдоним, язык, безопасный preset avatar, удаление аккаунта.
- [ ] T-006 Queue Text Match 1:1: TTL, отмена, idempotency, fairness, no fake users, no duplicate active session.
- [ ] T-007 Atomic reservation + mutual handshake, exclusion по блокировкам/банам, reconnect/timeout cleanup.
- [ ] T-008 Socket.IO session chat: per-event ACL, length/rate limits, XSS-safe, message retention policy.
- [ ] T-009 Mutual contact + post-match DM только после обоих согласий; revoke и block.
- [ ] T-010 Report/block/leave/mute, abuse categories, moderation queue, staff RBAC, audit, appeals.
- [ ] T-011 Observability, privacy-safe analytics, p50/p90 match wait, safety trends.
- [ ] T-012 Unit/integration/E2E security: age access, race, IDOR, unauthorized message, block, ban, spam, cleanup.
- [ ] T-013 Проверить store policy/local privacy laws/поставщика age checks и операционный бюджет.
- [ ] T-014 Демо на двух реальных тестовых клиентах и decision gate S1.

## Sprint 1 implementation status (local branch)

- В `apps/api` реализованы локальные dev identities, профиль и серверные age/rules gates, PostgreSQL queue/TTL/handshake, WebSocket чат, mutual contact/DM, block/report/leave и RBAC API. В `apps/web` реализован соответствующий русскоязычный flow.
- E2E тесты используют только synthetic identities и отдельную БД `pulse_test` на loopback. До Sprint 1 gate остаются production age/auth provider, retention/deletion worker, полная операционная moderation, privacy settings, два клиентских браузера с визуальной QA и закрытие оставшихся safety gaps.
- Запуск, тесты и ограничения описаны в README. Не считать незавершённые T-004—T-014 закрытыми только по наличию частичной реализации.

## P0.5 — текстовые Party Rooms
- [ ] T-050 Тематические комнаты 4–6, live presence, admission, host roles, leave/report.
- [ ] T-051 Starter prompts / лёгкие задания, без необходимости делиться личным.
- [ ] T-052 Opt-in balanced 2/2, 3/3 с правдивой очередью, fallback в open только по согласию.

## P1 — голос + Android
- [ ] T-101 Voice Match на LiveKit: consent, short-lived scoped tokens, mute/leave/block/report.
- [ ] T-102 Voice Party: очередь микрофона, host/moderator, revocation, staff operations.
- [ ] T-103 Счётчик participant-minutes, нагрузка и бюджет, без записи голоса по умолчанию.
- [ ] T-104 Avatar personalization и Connections UX.
- [ ] T-105 Android при работающей закрытой бете, compliance и age restrictions.
- [ ] T-106 Бета 100–300 18+ и Go/Iterate/Stop по данным.

## P2 — Moments / later
- [ ] T-201 Текстовая мини-лента с фильтрацией, репортами и лимитами; A/B контроль.
- [ ] T-202 Ненавязчивая кастомизация без pay-for-attention.

## P3 — только после safety gate
- [ ] T-301 Публичные прогулки и кофе с проверенными хостами, incident playbooks.
- [ ] T-302 iOS feasibility по текущему Apple §1.2; не обещать допуск.

## Definition of Done каждого пользовательского потока
- [ ] Проверка прав **сервером**, не клиентом, на каждом действии.
- [ ] Автотесты позитивных и негативных сценариев, race и reconnect.
- [ ] Block/report/leave работают и доступны с одного экрана.
- [ ] Метрики/логи не содержат текста чата, IP или приватных данных в продуктовой аналитике.
- [ ] Никакой fake online / AI-пользователей под видом реальных.
- [ ] Readme отражает только действительно работающий функционал.
