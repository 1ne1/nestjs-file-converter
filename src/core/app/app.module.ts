import { Module } from '@nestjs/common';

import { JwtAuthModule } from '@/core/auth/jwt-auth.module';
import { ChallengeModule } from '@/core/challenge/challenge.module';
import { ConfigModule } from '@/core/config/config.module';
import { DatabaseModule } from '@/core/database/database.module';
import { HealthModule } from '@/core/health/health.module';
import { MailModule } from '@/core/mail/mail.module';
import { StorageModule } from '@/core/storage/storage.module';
import { ThrottlerModule } from '@/core/throttler/throttler.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { ImageTransformationModule } from '@/modules/image-transformation/image-transformation.module';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { TransformationModule } from '@/modules/transformation/transformation.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    HealthModule,
    StorageModule,
    MailModule,
    ChallengeModule,
    ThrottlerModule,
    RbacModule,
    JwtAuthModule,
    AuthModule,
    UsersModule,
    TransformationModule,
    ImageTransformationModule,
  ],
})
export class AppModule {}
