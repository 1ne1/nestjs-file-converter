import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { UsersModule } from '@/modules/users/users.module';

import { JwtAuthGuard } from './jwt-auth.guard';

@Global()
@Module({
  imports: [UsersModule, JwtModule.register({ global: true })],
  providers: [JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class JwtAuthModule {}
