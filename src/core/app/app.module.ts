import { Module } from '@nestjs/common';

import { ConfigModule } from '@/core/config/config.module';
import { DatabaseModule } from '@/core/database/database.module';
import { HealthModule } from '@/core/health/health.module';
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
    ThrottlerModule,
    RbacModule,
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
