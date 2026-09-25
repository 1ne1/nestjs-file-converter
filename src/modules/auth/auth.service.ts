import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { ChallengeService } from '@/core/challenge/challenge.service';
import { ConfigService } from '@/core/config/config.service';
import { MailService } from '@/core/mail/mail.service';
import {
  ChallengeMethod,
  ChallengePurpose,
  User,
  UserStatus,
} from '@/generated/prisma/client';
import { UsersService } from '@/modules/users/users.service';

import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type RegisterResult =
  | { requiresConfirmation: false; user: User; tokens: AuthTokens }
  | { requiresConfirmation: true; challengeId: string };

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '30d';

interface PendingRegistrationMetadata {
  passwordHash: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly challenges: ChallengeService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const existing = await this.users.findByEmail(dto.email);

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(dto.password);

    if (!this.config.get('REGISTRATION_EMAIL_CONFIRMATION_ENABLED')) {
      const user = await this.users.create(dto.email, passwordHash);
      return {
        requiresConfirmation: false,
        user,
        tokens: this.issueTokens(user),
      };
    }

    const method = this.config.get(
      'REGISTRATION_CONFIRMATION_METHOD',
    ) as ChallengeMethod;

    const { challengeId, secret } = await this.challenges.create({
      purpose: ChallengePurpose.REGISTRATION,
      method,
      email: dto.email,
      metadata: { passwordHash } satisfies PendingRegistrationMetadata,
    });

    await this.sendRegistrationConfirmationEmail(
      dto.email,
      method,
      challengeId,
      secret,
    );

    return { requiresConfirmation: true, challengeId };
  }

  async confirmRegistration(
    challengeId: string,
    secret: string,
  ): Promise<{ user: User; tokens: AuthTokens }> {
    const challenge = await this.challenges.verify(challengeId, secret);

    if (challenge.purpose !== ChallengePurpose.REGISTRATION) {
      throw new BadRequestException('Invalid or expired code');
    }

    const metadata = challenge.metadata as
      | PendingRegistrationMetadata
      | null
      | undefined;

    if (!metadata?.passwordHash) {
      throw new BadRequestException('Invalid or expired code');
    }

    const existing = await this.users.findByEmail(challenge.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const user = await this.users.create(
      challenge.email,
      metadata.passwordHash,
    );

    return { user, tokens: this.issueTokens(user) };
  }

  private async sendRegistrationConfirmationEmail(
    email: string,
    method: ChallengeMethod,
    challengeId: string,
    secret: string,
  ): Promise<void> {
    if (method === ChallengeMethod.OTP) {
      await this.mail.sendMail({
        to: email,
        subject: 'Confirm your registration',
        text: `Your confirmation code is ${secret}. It expires in 10 minutes.`,
      });
      return;
    }

    const link = `${this.config.get('APP_BASE_URL')}/auth/register/confirm?challengeId=${challengeId}&token=${secret}`;

    await this.mail.sendMail({
      to: email,
      subject: 'Confirm your registration',
      text: `Click to confirm your registration: ${link}`,
    });
  }

  async login(dto: LoginDto): Promise<{ user: User; tokens: AuthTokens }> {
    const user = await this.users.findByEmail(dto.email);

    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new UnauthorizedException('Account is blocked');
    }

    return { user, tokens: this.issueTokens(user) };
  }

  async refresh(refreshToken: string | undefined): Promise<AuthTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException();
    }

    const payload = await this.jwt
      .verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      })
      .catch(() => null);

    if (!payload) {
      throw new UnauthorizedException();
    }

    const user = await this.users.findById(payload.sub);

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }

    return this.issueTokens(user);
  }

  private issueTokens(user: User): AuthTokens {
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: REFRESH_TOKEN_TTL,
    });

    return { accessToken, refreshToken };
  }
}
