import { z } from 'zod';

export const confirmChallengeOtpSchema = z.object({
  challengeId: z.uuid(),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export type ConfirmChallengeOtpDto = z.infer<typeof confirmChallengeOtpSchema>;

export const confirmChallengeLinkSchema = z.object({
  challengeId: z.uuid(),
  token: z.string().min(1),
});

export type ConfirmChallengeLinkDto = z.infer<
  typeof confirmChallengeLinkSchema
>;
