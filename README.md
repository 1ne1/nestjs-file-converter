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
│   ├── storage/     # S3-compatible object storage (MinIO locally)
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

## File Storage

Object storage is behind `StorageService` (`src/core/storage`) — an S3-compatible client (`@aws-sdk/client-s3`) that works against any S3-compatible backend by changing env vars, no code changes.

- **Local:** `docker compose up -d` also starts a MinIO container (S3-compatible, console at `http://localhost:9001`). The configured bucket is created automatically on app startup if it doesn't exist.
- **Production:** point `STORAGE_ENDPOINT`/`STORAGE_REGION`/`STORAGE_BUCKET`/credentials at a real provider (AWS S3, DigitalOcean Spaces, Cloudflare R2, ...).
- **Usage:** inject `StorageService` and call `upload(key, body, contentType)`, `download(key)` (returns a `Readable`), `delete(key)`.

## Authentication

JWT-based, cookie-only (no tokens in response bodies). `AuthModule` (`src/modules/auth`) exposes:

- `POST /auth/register`, `POST /auth/login` — issue `access_token` (15m) + `refresh_token` (30d) as `httpOnly` cookies. Passwords are hashed with `argon2id`.
- `POST /auth/refresh` — rotates both cookies from a valid refresh token.
- `POST /auth/logout` — clears both cookies. Refresh tokens aren't stored server-side (per spec), so this is the only way to end a session early.
- `GET /auth/me` — example of a route guarded by `JwtAuthGuard`; apply it to any route that needs an authenticated user (`req.user` is `{ id, email }`).

Email/OTP confirmation flows are a deliberately separate, not-yet-built follow-up — registration/login are unconditional for now.

Request bodies are validated with Zod via `ZodValidationPipe` (`src/core/validation`) — apply it per-param: `@Body(new ZodValidationPipe(someSchema)) dto: SomeDto`.

## Libraries

| Purpose       | Library                  |
|---------------|--------------------------|
| HTTP          | Fastify (`@nestjs/platform-fastify`) |
| Validation    | Zod                      |
| ORM           | Prisma (`@prisma/client`, driver adapter `@prisma/adapter-pg`) |
| Database      | PostgreSQL (`pg`, via `@prisma/adapter-pg`) |
| File storage  | S3-compatible (`@aws-sdk/client-s3`), MinIO locally |
| Auth          | `@nestjs/jwt` + `argon2` (password hashing) |

## Core Modules

| Purpose       | Module           |
|---------------|-----------------|
| Configuration | `ConfigModule`  |
| Database      | `DatabaseModule` |
| Health Check  | `HealthModule`  |
| File Storage  | `StorageModule` |
| Authentication | `AuthModule` (`src/modules/auth`) |

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
