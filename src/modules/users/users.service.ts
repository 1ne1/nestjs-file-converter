import { Injectable } from '@nestjs/common';

import { PrismaService } from '@/core/database/prisma.service';
import { User, UserStatus } from '@/generated/prisma/client';

export interface SelfProfile {
  id: string;
  email: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicProfile {
  id: string;
  email: string;
  status: UserStatus;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(email: string, passwordHash: string) {
    return this.prisma.user.create({ data: { email, passwordHash } });
  }

  toSelfProfile(user: User): SelfProfile {
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  toPublicProfile(user: User): PublicProfile {
    return { id: user.id, email: user.email, status: user.status };
  }
}
