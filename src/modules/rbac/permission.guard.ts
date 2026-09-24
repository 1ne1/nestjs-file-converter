import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSION_KEY } from './require-permission.decorator';
import { RbacService } from './rbac.service';

type RequestWithUser = { user?: { id: string } };

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<string>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new ForbiddenException();
    }

    const granted = await this.rbac.hasPermission(request.user.id, permission);
    if (!granted) {
      throw new ForbiddenException();
    }

    return true;
  }
}
