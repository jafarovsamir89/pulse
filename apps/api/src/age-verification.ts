import { ServiceUnavailableException } from '@nestjs/common';

export type AgeVerificationResult = { providerReference: string; verifiedAdult: boolean; checkedAt: Date };

/** Contract for a real age-verification vendor. No vendor is selected or wired for this local alpha. */
export interface AgeVerificationProvider {
  createChallenge(userId: string): Promise<{ challengeId: string; redirectUrl: string }>;
  verifyProviderCallback(payload: unknown, signature: string): Promise<AgeVerificationResult>;
}

export class UnconfiguredAgeVerificationProvider implements AgeVerificationProvider {
  async createChallenge(): Promise<never> {
    throw new ServiceUnavailableException('A production age-verification provider has not been configured');
  }
  async verifyProviderCallback(): Promise<never> {
    throw new ServiceUnavailableException('A production age-verification provider has not been configured');
  }
}
