import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '@/core/database/prisma.service';
import { Prisma } from '@/generated/prisma/client';

import { CreateGrantDto, UpdateGrantDto } from './dto/grant.dto';
import { CreatePermissionDto, UpdatePermissionDto } from './dto/permission.dto';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import { RbacService } from './rbac.service';

@Injectable()
export class RbacAdminService {
  private readonly logger = new Logger(RbacAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  listRoles() {
    return this.prisma.role.findMany({
      include: { permissions: true },
      orderBy: { name: 'asc' },
    });
  }

  async createRole(actorUserId: string, dto: CreateRoleDto) {
    const role = await this.withUniqueNameCheck(
      () => this.prisma.role.create({ data: dto }),
      'role',
    );
    await this.rbac.reload();
    this.audit(actorUserId, 'create', 'role', role.id);
    return role;
  }

  async updateRole(actorUserId: string, roleId: string, dto: UpdateRoleDto) {
    await this.findRoleOrThrow(roleId);
    const role = await this.withUniqueNameCheck(
      () => this.prisma.role.update({ where: { id: roleId }, data: dto }),
      'role',
    );
    await this.rbac.reload();
    this.audit(actorUserId, 'update', 'role', roleId);
    return role;
  }

  async deleteRole(actorUserId: string, roleId: string) {
    await this.findRoleOrThrow(roleId);

    const [grantCount, assignmentCount] = await Promise.all([
      this.prisma.rolePermission.count({ where: { roleId } }),
      this.prisma.userRole.count({ where: { roleId } }),
    ]);

    if (grantCount > 0 || assignmentCount > 0) {
      throw new ConflictException(
        'Role has existing grants or user assignments; remove those first',
      );
    }

    await this.prisma.role.delete({ where: { id: roleId } });
    await this.rbac.reload();
    this.audit(actorUserId, 'delete', 'role', roleId);
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { name: 'asc' } });
  }

  async createPermission(actorUserId: string, dto: CreatePermissionDto) {
    const permission = await this.withUniqueNameCheck(
      () => this.prisma.permission.create({ data: dto }),
      'permission',
    );
    await this.rbac.reload();
    this.audit(actorUserId, 'create', 'permission', permission.id);
    return permission;
  }

  async updatePermission(
    actorUserId: string,
    permissionId: string,
    dto: UpdatePermissionDto,
  ) {
    await this.findPermissionOrThrow(permissionId);
    const permission = await this.withUniqueNameCheck(
      () =>
        this.prisma.permission.update({
          where: { id: permissionId },
          data: dto,
        }),
      'permission',
    );
    await this.rbac.reload();
    this.audit(actorUserId, 'update', 'permission', permissionId);
    return permission;
  }

  async deletePermission(actorUserId: string, permissionId: string) {
    await this.findPermissionOrThrow(permissionId);

    const grantCount = await this.prisma.rolePermission.count({
      where: { permissionId },
    });
    if (grantCount > 0) {
      throw new ConflictException(
        'Permission has existing grants; remove those first',
      );
    }

    await this.prisma.permission.delete({ where: { id: permissionId } });
    await this.rbac.reload();
    this.audit(actorUserId, 'delete', 'permission', permissionId);
  }

  listGrants() {
    return this.prisma.rolePermission.findMany({
      include: { role: true, permission: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createGrant(actorUserId: string, dto: CreateGrantDto) {
    await this.findRoleOrThrow(dto.roleId);
    await this.findPermissionOrThrow(dto.permissionId);

    const grant = await this.withDuplicateGrantCheck(() =>
      this.prisma.rolePermission.create({
        data: {
          roleId: dto.roleId,
          permissionId: dto.permissionId,
          actions: dto.actions,
        },
      }),
    );

    await this.rbac.reload();
    this.audit(actorUserId, 'create', 'grant', grant.id);
    return grant;
  }

  async updateGrant(actorUserId: string, grantId: string, dto: UpdateGrantDto) {
    await this.findGrantOrThrow(grantId);
    const grant = await this.prisma.rolePermission.update({
      where: { id: grantId },
      data: { actions: dto.actions },
    });
    await this.rbac.reload();
    this.audit(actorUserId, 'update', 'grant', grantId);
    return grant;
  }

  async deleteGrant(actorUserId: string, grantId: string) {
    await this.findGrantOrThrow(grantId);
    await this.prisma.rolePermission.delete({ where: { id: grantId } });
    await this.rbac.reload();
    this.audit(actorUserId, 'delete', 'grant', grantId);
  }

  private async findRoleOrThrow(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  private async findPermissionOrThrow(permissionId: string) {
    const permission = await this.prisma.permission.findUnique({
      where: { id: permissionId },
    });
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }
    return permission;
  }

  private async findGrantOrThrow(grantId: string) {
    const grant = await this.prisma.rolePermission.findUnique({
      where: { id: grantId },
    });
    if (!grant) {
      throw new NotFoundException('Grant not found');
    }
    return grant;
  }

  private async withUniqueNameCheck<T>(
    operation: () => Promise<T>,
    entity: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`${entity} name already exists`);
      }
      throw error;
    }
  }

  private async withDuplicateGrantCheck<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A grant for this role and permission already exists',
        );
      }
      throw error;
    }
  }

  private audit(
    actorUserId: string,
    operation: 'create' | 'update' | 'delete',
    entity: string,
    entityId: string,
  ): void {
    this.logger.log(
      `RBAC ${operation} ${entity} ${entityId} by user ${actorUserId}`,
    );
  }
}
