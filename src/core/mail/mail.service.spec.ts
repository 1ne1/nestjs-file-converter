import * as nodemailer from 'nodemailer';

import { ConfigService } from '@/core/config/config.service';

import { MailService } from './mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  const sendMail = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });

  function buildConfig(overrides: Record<string, unknown> = {}): ConfigService {
    const values: Record<string, unknown> = {
      SMTP_FROM: 'noreply@example.com',
      SMTP_HOST: 'localhost',
      SMTP_PORT: 1025,
      SMTP_SECURE: false,
      SMTP_USER: undefined,
      SMTP_PASSWORD: undefined,
      ...overrides,
    };
    return { get: (key: string) => values[key] } as unknown as ConfigService;
  }

  it('creates a transport without auth when SMTP_USER is not set', () => {
    new MailService(buildConfig());

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      auth: undefined,
    });
  });

  it('creates a transport with auth when SMTP_USER is set', () => {
    new MailService(buildConfig({ SMTP_USER: 'user', SMTP_PASSWORD: 'pass' }));

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      auth: { user: 'user', pass: 'pass' },
    });
  });

  it('sends mail with the configured from address and given options', async () => {
    const service = new MailService(buildConfig());

    await service.sendMail({
      to: 'someone@example.com',
      subject: 'Hello',
      text: 'Plain text body',
      html: '<p>HTML body</p>',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'someone@example.com',
      subject: 'Hello',
      text: 'Plain text body',
      html: '<p>HTML body</p>',
    });
  });

  it('sends mail without html when omitted', async () => {
    const service = new MailService(buildConfig());

    await service.sendMail({
      to: 'someone@example.com',
      subject: 'Hello',
      text: 'Plain text body',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'someone@example.com',
      subject: 'Hello',
      text: 'Plain text body',
      html: undefined,
    });
  });
});
