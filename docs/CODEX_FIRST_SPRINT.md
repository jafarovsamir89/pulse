# PULSE v0.2 — первое задание агенту Codex (Sprint 1)

> **Это актуальное задание вместо v0.1.** Репозиторий: https://github.com/jafarovsamir89/pulse. Прочитай README, PRD, LITMATCH_FEATURE_MATRIX, ARCHITECTURE, SAFETY_PRIVACY, DECISIONS, TODO. Задача — сделать **близкую функциональную механику Text Match из Litmatch**, но с авторским кодом, дизайном и со встроенной защитой. Production-сервиса пока нет.

## Роль
Ты staff full-stack engineer + security lead. Не генерируй декоративную демоверсию вместо серверной системы. Реализуй **одну настоящую end-to-end вертикаль** в локальном/staging окружении: регистрация/18+ → псевдоним → кнопка Text Match → подбор двух реальных test accounts → чат → завершение → взаимное сохранение → DM только по mutual → block/report.

## Scope и порядок задач

1. Inspect repository and preserve existing files; report gaps and architecture decision log. Создай pnpm monorepo: `apps/web`, `apps/api`, `packages/contracts`, `infra/compose.yaml`.
2. NestJS API, Prisma/PostgreSQL migrations, Redis queue/presence/TTL; zod/DTO validation, typed config, health endpoint, OpenAPI, Docker Compose for dev.
3. Auth: dev-only test identities gated by NODE_ENV, **невозможно в production**; separate adapter/interface for real age verification, no age-gate bypass. Требования real-provider/legal до настоящей беты.
4. Profile: public nickname/avatar preset/language; private auth separated. No public email/IP/gender. Self-serve deletion request.
5. Text Match: server-authoritative queue+cancel+status, TTL/idempotency, language compatibility, block/ban exclusions, DB transaction/unique constraints, two-party acceptance handshake.
6. Authenticated Socket.IO private session chat: each action authorization, XSS-safe, bounded text, rate limits, duplicate client message protection, reconnect and drop cleanup.
7. After match: both members independently accept contact. Persistent messaging only with mutual consent. Block/unlink stops messaging immediately.
8. Safety: block/report/leave available while matched, moderator role with protected dashboard/API, report queue and audit; appeals stub only if clearly labelled and no public unmoderated rollout.
9. React Web/PWA mobile-first: `Text Match` front and center, honest loading/no-online state, short dialogue, mutual connect, profile, block/report; theme original, not pixel copy of Litmatch.
10. Tests: login/age-denied, queue races/idempotency, block/ban excludes, expired handshake, ACL/IDOR, unauthorized send, rate limits, DM without mutual, reconnect, deletion. CI lint/typecheck/test.
11. Update docs and `.env.example`, no credentials, no made-up online counters. Run commands and present exact results.

## Out of scope Sprint 1
Voice Match, voice Party Rooms, feed, payments, iOS, video, real offline events, real user recruitment without owner approval, payment integrations. **Existing `spikes/matchmaker.mjs` is a group experiment, not production 1:1 logic**; do not simply wrap and call it done.

## Verification
- Two independent adults-only dev test identities, using **server validated admission**, connect through Text Match and exchange messages.
- They cannot write to unrelated sessions; simultaneous request cannot create duplicate membership.
- No persisted contact or DM unless both explicitly agree; block forbids reconnect and DMs.
- At least one moderator can process report; audit trail exists; critical safety gaps are documented and deployment-blocking.
- `pnpm install`, local dev stack, migrations, tests, lint/typecheck reproducible with `.env.example` and clean workspace.
- All implementation should be in a separate feature branch / PR, never force-push main. End with changed files, tests/coverage, risks, and unimplemented features.

## No shortcuts
Never claim compliant age verification because of unchecked 18+ checkbox; never invent people, store mic recordings, copy assets/name/style/code from Litmatch, turn on public chat without moderation, or add paid access to attention. Respect local privacy law and platform policies.
