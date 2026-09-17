# Backend Template

NestJS backend project template. HTTP kernel is **Fastify** (`@nestjs/platform-fastify`), not Express — use Fastify plugins and types (`NestFastifyApplication`, `app.register(...)`) in `src/main.ts`. Compression (`@fastify/compress`) and cookies (`@fastify/cookie`) are already registered.

## Scripts

```bash
npm run start:dev    # Development with hot reload
npm run start:prod   # Production
npm run build        # Build
npm run lint         # Lint & fix
npm run test         # Unit tests
npm run test:e2e     # E2E tests
```

## Project Structure

```
src/
├── core/
│   ├── config/      # App configuration (env variables, validated with Zod)
│   ├── database/    # Prisma client + PostgreSQL connection
│   ├── health/      # Health check endpoints
│   └── app/         # Root module
├── generated/       # Prisma client output (generated, gitignored)
├── modules/         # Feature modules
└── main.ts          # Entry point

prisma/
├── schema.prisma    # Data model + generator/datasource config
└── migrations/      # Prisma migration history
```

## Database

PostgreSQL and Prisma are already wired in. Use them for new modules — no extra setup.

- **Local Postgres:** `docker compose up -d` (image and credentials from `.env` / `.env.example`)
- **Connection:** `PrismaService` (`src/core/database`) extends `PrismaClient` and is provided by the global `DatabaseModule`. Inject it wherever you need the database.
- **Connection URL:** read from `DATABASE_URL` via `prisma.config.ts` (CLI) and `ConfigService` (runtime) — Prisma 7 no longer reads a `url` from `schema.prisma`.
- **Models:** define them in `prisma/schema.prisma`, then run `npm run prisma:generate` to regenerate the client into `src/generated/prisma`.

```bash
npm run prisma:generate   # Regenerate the client after editing schema.prisma
npm run migrate:dev       # Create + apply a migration in development
npm run migrate:deploy    # Apply pending migrations (CI/production)
npm run migrate:reset     # Drop and recreate the dev database
npm run studio             # Open Prisma Studio
```

## Libraries

| Purpose       | Library                  |
|---------------|--------------------------|
| HTTP          | Fastify (`@nestjs/platform-fastify`) |
| Validation    | Zod                      |
| ORM           | Prisma (`@prisma/client`, driver adapter `@prisma/adapter-pg`) |
| Database      | PostgreSQL (`pg`, via `@prisma/adapter-pg`) |

## Core Modules

| Purpose       | Module           |
|---------------|-----------------|
| Configuration | `ConfigModule`  |
| Database      | `DatabaseModule` |
| Health Check  | `HealthModule`  |

## Adding a Module

```bash
nest generate module <name>
nest generate controller <name>
nest generate service <name>
```

## Code Style

- Use `@` aliases for imports (e.g., `@config/config.service`)
- Run `npm run format` before committing
- Follow NestJS module pattern
