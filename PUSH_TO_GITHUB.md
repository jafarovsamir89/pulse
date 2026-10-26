# PULSE — изменения и проверка v0.4

**25.10.2026.** [Репозиторий](https://github.com/jafarovsamir89/pulse).

1. Прочитать README, docs/strategy/AGENT_JOURNAL.md и текущий статус PR.
2. Работать на feature branch с префиксом codex/. Не смешивать docs и устранение дефектов alpha в один бесконтрольный пакет.
3. Для документации: python3 docs/strategy/models.py и python3 docs/strategy/validate_docs.py; git diff --check. npm test проверяет только прежний matching spike.
4. Для приложения — команды из фактической alpha ветки и воспроизводимый clean CI; не выдавать research-tests за проверку приложения.
5. Commit → push → PR → проверка CI/review. Обновить заголовок/описание PR под итоговый объём.
6. Записать branch/SHA, команды, evidence и конкретный следующий шаг в журналы.

Никаких секретов, персональных данных и .env в коммитах. Деплой, production migrations и публикация пакетов магазинов — отдельные действия, не часть проверки документации.

prototype/index.html и spikes/ исторические. Игровая v0.4 ещё не реализована. Для её реализации действует docs/CODEX_FIRST_SPRINT.md.
