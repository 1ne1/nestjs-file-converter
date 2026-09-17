# Config Module

A type-safe configuration module that wraps NestJS `@nestjs/config` with Zod validation. Environment variables are validated at application startup, ensuring the app fails fast if required config is missing or invalid.

## Usage

Inject `ConfigService` into any provider:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from './config/config.service';

@Injectable()
export class MyService {
  constructor(private readonly config: ConfigService) {}

  someMethod() {
    const port = this.config.get('PORT');      // Type-safe, autocomplete works
    const env = this.config.get('NODE_ENV');   // Returns 'development' | 'production'
  }
}
```

## Adding New Options

1. **Add validation** in `config.validation.ts`:

```typescript
export const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535),
  NODE_ENV: z.enum(['development', 'production']),
  DATABASE_URL: z.url(),  // Add new option here
});
```

`config.types.ts` infers `Config` from this schema (`z.infer<typeof configSchema>`), so it never needs manual updates.

2. **Set the environment variable** in your `.env` file or environment.

That's it. The new option is now type-safe and validated at startup.
