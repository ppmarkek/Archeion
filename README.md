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

## UI-стек

UI собран на Tailwind CSS v4 и shadcn/ui в стиле `new-york`. Компоненты принадлежат проекту и лежат в `components/ui`:

- `button`, `badge`, `card`, `input`, `textarea`, `label`;
- `form` с react-hook-form и zod-ready API;
- `dialog`, `dropdown-menu`, `tabs`, `table`, `separator`, `sidebar`.

Локальные копируемые блоки анимаций находятся в отдельных пространствах:

- `components/motion-primitives` — `BlurFade` и `AnimatedTabs` на Motion for React;
- `components/magic-ui` — `AnimatedGridPattern` и `BorderBeam`.

Alias `@/*` настроен в `tsconfig.json`, а `components.json` оставляет возможность добавлять новые shadcn/ui-компоненты CLI-командой.
