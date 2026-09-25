import { Global, Module } from '@nestjs/common';

import { ConfigModule } from '@/core/config/config.module';

import { MailService } from './mail.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
