import { Global, Module } from '@nestjs/common';

import { PermissionGuard } from './permission.guard';
import { RbacAdminController } from './rbac-admin.controller';
import { RbacAdminService } from './rbac-admin.service';
import { RbacService } from './rbac.service';

@Global()
@Module({
  controllers: [RbacAdminController],
  providers: [RbacService, RbacAdminService, PermissionGuard],
  exports: [RbacService, PermissionGuard],
})
export class RbacModule {}
