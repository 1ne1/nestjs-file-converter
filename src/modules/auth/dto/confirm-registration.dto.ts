import { z } from 'zod';

export const confirmRegistrationOtpSchema = z.object({
  challengeId: z.uuid(),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export type ConfirmRegistrationOtpDto = z.infer<
  typeof confirmRegistrationOtpSchema
>;

export const confirmRegistrationLinkSchema = z.object({
  challengeId: z.uuid(),
  token: z.string().min(1),
});

export type ConfirmRegistrationLinkDto = z.infer<
  typeof confirmRegistrationLinkSchema
>;
