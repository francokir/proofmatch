/** DEMO ONLY — NOT MIDNIGHT, NOT LACE, NOT REAL LEDGER DATA. */
import type { ProofMatchUiApi, PublicJobState, WalletStatus } from '../domain/integration';

const demoPublicState: PublicJobState = {
  jobId: 'PM-AI-001',
  jobMaximumCompensation: 1200n,
  jobRequiredWeeklyHours: 20n,
  jobState: 'Open',
  matchCount: 3n,
  usedNullifierCount: 3n,
};

let walletStatus: WalletStatus = 'not_detected';
export const demoContractAddress = 'DEMO CONTRACT REFERENCE';

export const demoProofMatchUiApi: ProofMatchUiApi = {
  wallet: {
    get status() { return walletStatus; },
    async connectWallet() { walletStatus = 'connecting'; await Promise.resolve(); walletStatus = 'connected'; },
  },
  async prepareCandidatePrivateState() { await Promise.resolve(); },
  async proveMatch() { await Promise.resolve(); },
  async readPublicState() { return demoPublicState; },
  async refreshPublicState() { return demoPublicState; },
  async resetCandidatePrivateState() { await Promise.resolve(); },
};
