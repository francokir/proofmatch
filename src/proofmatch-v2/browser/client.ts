import { connectLace } from '../../proofmatch/browser/lace';
import { createLaceBrowserProviders } from '../../proofmatch/browser/providers';
import { createProofMatchV2Service, type ProofMatchV2Service } from '../service';
import {
  PROOF_MATCH_V2_PRIVATE_STATE_ID,
  type ProofMatchV2StateProvider,
} from '../private-state';

/**
 * Everything the V2 browser facade needs after a wallet connection.
 *
 * The Lace adapter, the provider wiring and the local-prover guard are reused
 * verbatim from V1: they are contract-agnostic, and a second copy would be a
 * second place to forget `setNetworkId` or the prover check.
 */
export interface ProofMatchV2Client {
  readonly service: ProofMatchV2Service;
  readonly privateStateProvider: ProofMatchV2StateProvider;
  readonly privateStateId: string;
}

export interface ConnectProofMatchV2Options {
  readonly networkId: string;
  readonly zkConfigBaseUrl: string;
  readonly privateStateStoreName: string;
  readonly privateStatePassword: string;
}

export async function connectProofMatchV2(
  options: ConnectProofMatchV2Options,
): Promise<ProofMatchV2Client> {
  const connected = await connectLace(options.networkId);
  const providers = await createLaceBrowserProviders(
    connected,
    options.zkConfigBaseUrl,
    options.privateStateStoreName,
    options.privateStatePassword,
  );
  // V1 and V2 publish differently named circuits, so a single base URL serves
  // both key sets without collision.
  const service = createProofMatchV2Service(providers, options.zkConfigBaseUrl);
  return {
    service,
    privateStateProvider: providers.privateStateProvider as unknown as ProofMatchV2StateProvider,
    privateStateId: PROOF_MATCH_V2_PRIVATE_STATE_ID,
  };
}
