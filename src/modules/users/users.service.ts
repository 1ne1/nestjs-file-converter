import { ConflictException, Injectable } from '@nestjs/common';

import { PrismaService } from '@/core/database/prisma.service';
import { Prisma, User, UserStatus } from '@/generated/prisma/client';

export interface UpdateUserFields {
  name?: string;
  email?: string;
  status?: UserStatus;
}

export interface SelfProfile {
  id: string;
  email: string;
  name: string | null;
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

  async update(id: string, data: UpdateUserFields): Promise<User> {
    try {
      return await this.prisma.user.update({ where: { id }, data });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  toSelfProfile(user: User): SelfProfile {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  toPublicProfile(user: User): PublicProfile {
    return { id: user.id, email: user.email, status: user.status };
  }
}
