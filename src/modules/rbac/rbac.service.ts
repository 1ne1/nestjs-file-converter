import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '@/core/database/prisma.service';

interface Grant {
  actions: string[] | null;
}

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);
  private rolePermissions = new Map<string, Map<string, Grant>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
    });

    const rolePermissions = new Map<string, Map<string, Grant>>();
    for (const role of roles) {
      const grants = new Map<string, Grant>();
      for (const rolePermission of role.permissions) {
        grants.set(rolePermission.permission.name, {
          actions:
            rolePermission.actions.length > 0 ? rolePermission.actions : null,
        });
      }
      rolePermissions.set(role.name, grants);
    }

    this.rolePermissions = rolePermissions;
    this.logger.log(`Loaded grants for ${rolePermissions.size} role(s)`);
  }

  getPermissionsForRoles(roleNames: string[]): Set<string> {
    const permissions = new Set<string>();
    for (const roleName of roleNames) {
      for (const permission of this.rolePermissions.get(roleName)?.keys() ??
        []) {
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

  /**
   * When `action` is omitted, this checks only that the permission is
   * granted at all - existing callers across the app do this and rely on
   * it. When `action` is given, a grant with no `actions` recorded allows
   * every action for that permission; otherwise the action must be listed.
   */
  async hasPermission(
    userId: string,
    permission: string,
    action?: string,
  ): Promise<boolean> {
    const roleNames = await this.getRoleNamesForUser(userId);

    for (const roleName of roleNames) {
      const grant = this.rolePermissions.get(roleName)?.get(permission);
      if (!grant) {
        continue;
      }
      if (!action || grant.actions === null || grant.actions.includes(action)) {
        return true;
      }
    }

    return false;
  }
}
