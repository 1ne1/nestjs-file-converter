import { Global, Module } from '@nestjs/common';

import { ConfigModule } from '@/core/config/config.module';

import { StorageService } from './storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
