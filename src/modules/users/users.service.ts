import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import * as argon2 from 'argon2';

import { ChallengeService } from '@/core/challenge/challenge.service';
import { PrismaService } from '@/core/database/prisma.service';
import { MailService } from '@/core/mail/mail.service';
import {
  ChallengeMethod,
  ChallengePurpose,
  Prisma,
  User,
  UserStatus,
} from '@/generated/prisma/client';

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

export interface ListItem {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  createdAt: Date;
}

export interface ListUsersParams {
  cursor?: string;
  limit: number;
  q?: string;
  status?: UserStatus;
  sort: 'createdAt' | 'email';
  order: 'asc' | 'desc';
}

export interface ListUsersResult {
  items: ListItem[];
  nextCursor: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly challenges: ChallengeService,
    private readonly mail: MailService,
  ) {}

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

  async initiateEmailChange(
    userId: string,
    newEmail: string,
  ): Promise<{ challengeId: string }> {
    const existing = await this.findByEmail(newEmail);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const { challengeId, secret } = await this.challenges.create({
      purpose: ChallengePurpose.EMAIL_CHANGE,
      method: ChallengeMethod.OTP,
      email: newEmail,
      userId,
    });

    await this.mail.sendMail({
      to: newEmail,
      subject: 'Confirm your new email address',
      text: `Your confirmation code is ${secret}. It expires in 10 minutes.`,
    });

    return { challengeId };
  }

  async confirmEmailChange(
    userId: string,
    challengeId: string,
    secret: string,
  ): Promise<User> {
    const challenge = await this.challenges.verify(challengeId, secret);

    if (
      challenge.purpose !== ChallengePurpose.EMAIL_CHANGE ||
      challenge.userId !== userId
    ) {
      throw new BadRequestException('Invalid or expired code');
    }

    return this.update(userId, { email: challenge.email });
  }

  async initiateSelfDelete(
    userId: string,
    email: string,
  ): Promise<{ challengeId: string }> {
    const { challengeId, secret } = await this.challenges.create({
      purpose: ChallengePurpose.SELF_DELETE,
      method: ChallengeMethod.OTP,
      email,
      userId,
    });

    await this.mail.sendMail({
      to: email,
      subject: 'Confirm account deletion',
      text: `Your account deletion confirmation code is ${secret}. It expires in 10 minutes. If you did not request this, ignore this email.`,
    });

    return { challengeId };
  }

  async confirmSelfDelete(
    userId: string,
    challengeId: string,
    secret: string,
  ): Promise<void> {
    const challenge = await this.challenges.verify(challengeId, secret);

    if (
      challenge.purpose !== ChallengePurpose.SELF_DELETE ||
      challenge.userId !== userId
    ) {
      throw new BadRequestException('Invalid or expired code');
    }

    await this.remove(userId);
  }

  async remove(id: string): Promise<void> {
    const passwordHash = await argon2.hash(randomUUID());

    await this.prisma.user.update({
      where: { id },
      data: {
        email: `deleted-${id}@deleted.local`,
        name: null,
        passwordHash,
        status: UserStatus.DELETED,
      },
    });
    await this.prisma.userRole.deleteMany({ where: { userId: id } });
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

  async list(params: ListUsersParams): Promise<ListUsersResult> {
    const { cursor, limit, q, status, sort, order } = params;

    const where: Prisma.UserWhereInput = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    let users: User[];
    try {
      users = await this.prisma.user.findMany({
        where,
        orderBy: { [sort]: order },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new BadRequestException('Invalid cursor');
      }
      throw error;
    }

    const hasMore = users.length > limit;
    const items = hasMore ? users.slice(0, limit) : users;

    return {
      items: items.map((user) => this.toListItem(user)),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  private toListItem(user: User): ListItem {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
