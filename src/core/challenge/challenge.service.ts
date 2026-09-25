import { randomBytes, randomInt } from 'node:crypto';

import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import * as argon2 from 'argon2';

import { PrismaService } from '@/core/database/prisma.service';
import {
  ChallengeMethod,
  ChallengePurpose,
  EmailChallenge,
  Prisma,
} from '@/generated/prisma/client';

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

export interface CreateChallengeParams {
  purpose: ChallengePurpose;
  method: ChallengeMethod;
  email: string;
  userId?: string;
  metadata?: Prisma.InputJsonValue;
  ttlMs?: number;
  maxAttempts?: number;
}

export interface CreateChallengeResult {
  challengeId: string;
  secret: string;
}

@Injectable()
export class ChallengeService {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: CreateChallengeParams): Promise<CreateChallengeResult> {
    const { purpose, method, email, userId, metadata } = params;

    const recentChallenge = await this.prisma.emailChallenge.findFirst({
      where: {
        email,
        purpose,
        createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentChallenge) {
      throw new HttpException(
        'Please wait before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const secret =
      method === ChallengeMethod.OTP
        ? randomInt(0, 1_000_000).toString().padStart(6, '0')
        : randomBytes(32).toString('base64url');

    const secretHash = await argon2.hash(secret);

    const challenge = await this.prisma.emailChallenge.create({
      data: {
        purpose,
        method,
        email,
        secretHash,
        userId,
        metadata,
        maxAttempts: params.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        expiresAt: new Date(Date.now() + (params.ttlMs ?? DEFAULT_TTL_MS)),
      },
    });

    return { challengeId: challenge.id, secret };
  }

  async verify(challengeId: string, secret: string): Promise<EmailChallenge> {
    const challenge = await this.prisma.emailChallenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      throw new BadRequestException('Invalid or expired code');
    }

    if (challenge.consumedAt) {
      throw new BadRequestException('Invalid or expired code');
    }

    if (challenge.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired code');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      throw new BadRequestException('Attempt limit exceeded');
    }

    const matches = await argon2.verify(challenge.secretHash, secret);

    if (!matches) {
      await this.prisma.emailChallenge.update({
        where: { id: challengeId },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid or expired code');
    }

    return this.prisma.emailChallenge.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    });
  }
}
