# Archeion

Стартовый Next.js-проект на TypeScript со структурированным PostgreSQL-слоем.

## Быстрый запуск

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:migrate
npm run dev
```

После запуска:

- приложение: http://localhost:3000
- healthcheck приложения и базы: http://localhost:3000/api/health

## Структура данных

Схема находится в [`db/schema.ts`](./db/schema.ts) и управляется через Drizzle ORM:

- `records` — основные записи с состоянием, slug, контентом и JSONB-метаданными;
- `tags` — нормализованные теги;
- `record_tags` — связь many-to-many с каскадным удалением.
- `vault_items` — перестраиваемый индекс Markdown-заметок и вложений из личного Vault.

Для изменения схемы:

```bash
npm run db:generate
npm run db:migrate
```

Полезные команды:

```bash
npm run db:studio  # Drizzle Studio
npm run db:logs    # логи PostgreSQL
npm run check      # typecheck + lint + production build
```

PostgreSQL запускается локально через `docker-compose.yml`, а данные сохраняются в Docker volume `postgres_data`.

## Vault: заметки и файлы

Первый модуль second brain - личный Vault. Новые заметки всегда создаются как `.md`-файлы, поэтому их можно редактировать и вне Archeion. Любой загруженный файл сохраняется как Attachment рядом с заметками, а PostgreSQL хранит индекс метаданных.

- открыть Vault: http://localhost:3000/vault;
- создать заметку: **Создать .md**;
- добавить учебный материал: **Добавить файл**.
- открыть папку: нажать её в режиме **Папки** — содержимое раскроется прямо под ней, не скрывая соседние папки; повторное нажатие сворачивает ветку;
- открыть несколько материалов: выбирать файлы в панели — они появятся в округлённых вкладках сверху (до 8 одновременно);
- разделить рабочую область: активировать вкладку и выбрать сторону в группе **Разделить экран**; одновременно видны до 4 файлов;
- уменьшить боковую панель: нажать круглую стрелку рядом с названием **Vault**. Панель останется на выбранной стороне и сохранит все действия.

В браузерном режиме Vault хранится в `data/vault` (эта папка исключена из Git). В packaged Electron-версии он хранится в user data приложения.

## UI-стек

UI собран на Tailwind CSS v4 и shadcn/ui в стиле `new-york`. Компоненты принадлежат проекту и лежат в `components/ui`:

- `button`, `badge`, `card`, `input`, `textarea`, `label`;
- `form` с react-hook-form и zod-ready API;
- `dialog`, `dropdown-menu`, `tabs`, `table`, `separator`, `sidebar`.

Локальные копируемые блоки анимаций находятся в отдельных пространствах:

- `components/motion-primitives` — `BlurFade` и `AnimatedTabs` на Motion for React;
- `components/magic-ui` — `AnimatedGridPattern` и `BorderBeam`.

Alias `@/*` настроен в `tsconfig.json`, а `components.json` оставляет возможность добавлять новые shadcn/ui-компоненты CLI-командой.

## Electron

Electron добавлен отдельным desktop-слоем в `electron/`. В браузерном режиме Next.js работает как обычно, а Electron загружает тот же UI через безопасный preload bridge.

```bash
npm run desktop:dev    # Next.js + Electron shell
npm run desktop:build  # standalone Next.js + installer в release/
```

Production packaging использует `next build` с `output: "standalone"`. PostgreSQL остаётся отдельным сервисом и должен быть доступен через Docker или `DATABASE_URL`.
