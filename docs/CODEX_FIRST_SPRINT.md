# PULSE — следующее задание Codex, v0.4

**25.10.2026.** Заменяет старое задание построить Text Match как самостоятельный продукт. Не пересоздавать уже существующую alpha. Текущий запрос — документация; инженерная реализация начинается отдельной задачей.

## Перед началом

Прочитать [журнал](strategy/AGENT_JOURNAL.md), [PRD](PRD.md), [GAME_DESIGN](GAME_DESIGN.md), [ARCHITECTURE](ARCHITECTURE.md), [SAFETY_PRIVACY](SAFETY_PRIVACY.md), [технический аудит](strategy/TECHNICAL_REVIEW.md). Проверить main/PR №1 и SHA: код alpha ещё может быть в отдельной ветке. Не объявлять его отсутствующим и не сливать автоматически без review.

## Первый инженерный пакет P01

В feature branch воспроизвести clean CI и критические T01–T14. Приоритет: чужой leave, отзыв входящих событий, scoped block/cancel, race-safe consent, TTL, история/reconnect, удаления, Redis recovery. Сначала failing regression, затем исправление и соседние проверки. Synthetic identities, строго local DB/API/Redis. Не ослаблять assertion ради зелёного CI.

Результат: воспроизводимая безопасная база; точные открытые дефекты, commands и evidence. Не делать 3D/платежи/voice параллельно.

## Следующий пакет P04, после P01

Одна вертикаль G1: два клиента → invite/ограниченный matching → ready → 7 раундов → RESULTS → новый матч по взаимному согласию. Скрытые own answers/guesses, deadlines, idempotency, scores и replay на сервере. Не имитировать второго человека.

Поддержать независимые rematch / remeet / contact+DM, leave/block/report и account/session revocation. Контент только проверенной версии; plaintext rendering; analytics без сырого ответа.

## Приёмка

- Реальные local Postgres/Redis и два браузерных клиента; третий не читает/не управляет чужим.
- До reveal нет чужого секрета ни в REST, ни socket/snapshot/logs.
- Duplicate/retry/timeout/restart не удваивает очки; закончившийся матч не оживает.
- Отзыв доступа прекращает новую доставку; contact vote не воскрешает revoke.
- Disconnect/return/skip/exit корректны; нет случайного автоответа.
- UI работает с клавиатурой, reduced motion и слабым соединением; replay >100 сообщений.
- Clean install/generate/lint/typecheck/test/build по реально объявленным зависимостям.
- Живые люди не допускаются без P05 и отдельного разрешённого плана пилота.

Не деплоить, не менять production данные/кошельки/пакеты магазинов. Отчёт: SHA, изменённые файлы, проверки, evidence, оставшиеся риски и следующий шаг.
