import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';

import { ConfigService } from '@/core/config/config.service';
import { UserStatus } from '@/generated/prisma/client';
import { UsersService } from '@/modules/users/users.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export type AuthenticatedRequest = FastifyRequest & { user: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies['access_token'];

    if (!token) {
      throw new UnauthorizedException();
    }

    const payload = await this.jwt
      .verifyAsync<{
        sub: string;
      }>(token, { secret: this.config.get('JWT_ACCESS_SECRET') })
      .catch(() => null);

    if (!payload) {
      throw new UnauthorizedException();
    }

    const user = await this.users.findById(payload.sub);

    if (!user || user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException();
    }

    request.user = { id: user.id, email: user.email };

    return true;
  }
}
