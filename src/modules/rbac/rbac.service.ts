import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '@/core/database/prisma.service';

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);
  private rolePermissions = new Map<string, Set<string>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
    });

    const rolePermissions = new Map<string, Set<string>>();
    for (const role of roles) {
      rolePermissions.set(
        role.name,
        new Set(role.permissions.map((rp) => rp.permission.name)),
      );
    }

    this.rolePermissions = rolePermissions;
    this.logger.log(`Loaded grants for ${rolePermissions.size} role(s)`);
  }

  getPermissionsForRoles(roleNames: string[]): Set<string> {
    const permissions = new Set<string>();
    for (const roleName of roleNames) {
      for (const permission of this.rolePermissions.get(roleName) ?? []) {
        permissions.add(permission);
      }
    }
    return permissions;
  }

  async getRoleNamesForUser(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return userRoles.map((userRole) => userRole.role.name);
  }

  async getPermissionsForUser(userId: string): Promise<Set<string>> {
    const roleNames = await this.getRoleNamesForUser(userId);
    return this.getPermissionsForRoles(roleNames);
  }

  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const permissions = await this.getPermissionsForUser(userId);
    return permissions.has(permission);
  }
}
