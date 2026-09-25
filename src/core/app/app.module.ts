import { Module } from '@nestjs/common';

import { JwtAuthModule } from '@/core/auth/jwt-auth.module';
import { ConfigModule } from '@/core/config/config.module';
import { DatabaseModule } from '@/core/database/database.module';
import { HealthModule } from '@/core/health/health.module';
import { MailModule } from '@/core/mail/mail.module';
import { StorageModule } from '@/core/storage/storage.module';
import { ThrottlerModule } from '@/core/throttler/throttler.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    StorageModule,
    MailModule,
    ThrottlerModule,
    RbacModule,
    JwtAuthModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
