import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '@/core/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '@/core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '@/core/validation/zod-validation.pipe';

import { createGrantSchema, updateGrantSchema } from './dto/grant.dto';
import type { CreateGrantDto, UpdateGrantDto } from './dto/grant.dto';
import {
  createPermissionSchema,
  updatePermissionSchema,
} from './dto/permission.dto';
import type {
  CreatePermissionDto,
  UpdatePermissionDto,
} from './dto/permission.dto';
import { createRoleSchema, updateRoleSchema } from './dto/role.dto';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RbacAdminService } from './rbac-admin.service';
import { RbacService } from './rbac.service';

const MANAGE_PERMISSION = 'rbac.manage';

@Controller('admin/rbac')
@UseGuards(JwtAuthGuard)
export class RbacAdminController {
  constructor(
    private readonly rbacAdmin: RbacAdminService,
    private readonly rbac: RbacService,
  ) {}

  @Get('roles')
  async listRoles(@Req() req: AuthenticatedRequest) {
    await this.requireManagePermission(req);
    return this.rbacAdmin.listRoles();
  }

  @Post('roles')
  async createRole(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createRoleSchema)) dto: CreateRoleDto,
  ) {
    await this.requireManagePermission(req);
    return this.rbacAdmin.createRole(req.user.id, dto);
  }

  @Put('roles/:roleId')
  async updateRole(
    @Req() req: AuthenticatedRequest,
    @Param('roleId') roleId: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) dto: UpdateRoleDto,
  ) {
    await this.requireManagePermission(req);
    return this.rbacAdmin.updateRole(req.user.id, roleId, dto);
  }

  @Delete('roles/:roleId')
  @HttpCode(204)
  async deleteRole(
    @Req() req: AuthenticatedRequest,
    @Param('roleId') roleId: string,
  ) {
    await this.requireManagePermission(req);
    await this.rbacAdmin.deleteRole(req.user.id, roleId);
  }

  @Get('permissions')
  async listPermissions(@Req() req: AuthenticatedRequest) {
    await this.requireManagePermission(req);
    return this.rbacAdmin.listPermissions();
  }

  @Post('permissions')
  async createPermission(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createPermissionSchema))
    dto: CreatePermissionDto,
  ) {
    await this.requireManagePermission(req);
    return this.rbacAdmin.createPermission(req.user.id, dto);
  }

  @Put('permissions/:permissionId')
  async updatePermission(
    @Req() req: AuthenticatedRequest,
    @Param('permissionId') permissionId: string,
    @Body(new ZodValidationPipe(updatePermissionSchema))
    dto: UpdatePermissionDto,
  ) {
    await this.requireManagePermission(req);
    return this.rbacAdmin.updatePermission(req.user.id, permissionId, dto);
  }

  @Delete('permissions/:permissionId')
  @HttpCode(204)
  async deletePermission(
    @Req() req: AuthenticatedRequest,
    @Param('permissionId') permissionId: string,
  ) {
    await this.requireManagePermission(req);
    await this.rbacAdmin.deletePermission(req.user.id, permissionId);
  }

  @Get('grants')
  async listGrants(@Req() req: AuthenticatedRequest) {
    await this.requireManagePermission(req);
    return this.rbacAdmin.listGrants();
  }

  @Post('grants')
  async createGrant(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createGrantSchema)) dto: CreateGrantDto,
  ) {
    await this.requireManagePermission(req);
    return this.rbacAdmin.createGrant(req.user.id, dto);
  }

  @Put('grants/:grantId')
  async updateGrant(
    @Req() req: AuthenticatedRequest,
    @Param('grantId') grantId: string,
    @Body(new ZodValidationPipe(updateGrantSchema)) dto: UpdateGrantDto,
  ) {
    await this.requireManagePermission(req);
    return this.rbacAdmin.updateGrant(req.user.id, grantId, dto);
  }

  @Delete('grants/:grantId')
  @HttpCode(204)
  async deleteGrant(
    @Req() req: AuthenticatedRequest,
    @Param('grantId') grantId: string,
  ) {
    await this.requireManagePermission(req);
    await this.rbacAdmin.deleteGrant(req.user.id, grantId);
  }

  private async requireManagePermission(
    req: AuthenticatedRequest,
  ): Promise<void> {
    if (!(await this.rbac.hasPermission(req.user.id, MANAGE_PERMISSION))) {
      throw new ForbiddenException();
    }
  }
}
