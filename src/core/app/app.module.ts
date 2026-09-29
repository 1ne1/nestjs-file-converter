import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { AllExceptionsFilter } from './all-exceptions.filter';
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
import { TransformationHistoryModule } from '@/modules/transformation-history/transformation-history.module';
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
    ScheduleModule.forRoot(),
    RbacModule,
    JwtAuthModule,
    AuthModule,
    UsersModule,
    TransformationHistoryModule,
    TransformationModule,
    ImageTransformationModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
