import { connectLace } from '../../proofmatch/browser/lace';
import { createLaceBrowserProviders } from '../../proofmatch/browser/providers';
import { createProofMatchV2Service, type ProofMatchV2Service } from '../service';
import {
  PROOF_MATCH_V2_PRIVATE_STATE_ID,
  type ProofMatchV2StateProvider,
} from '../private-state';
import {
  createProofMatchV2QService,
  PROOF_MATCH_V2Q_PRIVATE_STATE_ID,
  type ProofMatchV2QService,
} from '../qualification/service';
import type { ProofMatchV2QStateProvider } from '../qualification/private-state';

/**
 * Everything the V2 browser facade needs after a wallet connection.
 *
 * The Lace adapter, the provider wiring and the local-prover guard are reused
 * verbatim from V1: they are contract-agnostic, and a second copy would be a
 * second place to forget `setNetworkId` or the prover check.
 */
export interface ProofMatchV2QClient {
  readonly service: ProofMatchV2QService;
  readonly privateStateProvider: ProofMatchV2QStateProvider;
  readonly privateStateId: string;
  readonly bridgeUrl: string;
}

export interface ProofMatchV2Client {
  readonly service: ProofMatchV2Service;
  readonly privateStateProvider: ProofMatchV2StateProvider;
  readonly privateStateId: string;
  /** Present only when the qualification bridge is configured. */
  readonly v2q?: ProofMatchV2QClient;
}

export interface ConnectProofMatchV2Options {
  readonly networkId: string;
  readonly zkConfigBaseUrl: string;
  readonly privateStateStoreName: string;
  readonly privateStatePassword: string;
  /** Enables verified qualifications (V2Q vacancies + credential flows). */
  readonly qualification?: {
    readonly bridgeUrl: string;
    /** Separate IndexedDB store so a V2 demo reset never touches V2Q secrets. */
    readonly privateStateStoreName?: string;
  };
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

  // V2Q reuses V2's circuit NAMES (plus attestQualification), so its keys
  // live under their own `v2q/` prefix and its providers get that base URL.
  // A second provider set over the SAME Lace connection: one wallet
  // authorization, isolated zk-config and private-state surfaces.
  let v2q: ProofMatchV2QClient | undefined;
  if (options.qualification) {
    const v2qBase = `${options.zkConfigBaseUrl.replace(/\/$/, '')}/v2q`;
    const v2qProviders = await createLaceBrowserProviders(
      connected,
      v2qBase,
      options.qualification.privateStateStoreName ?? `${options.privateStateStoreName}-v2q`,
      options.privateStatePassword,
    );
    v2q = {
      service: createProofMatchV2QService(v2qProviders, v2qBase),
      privateStateProvider:
        v2qProviders.privateStateProvider as unknown as ProofMatchV2QStateProvider,
      privateStateId: PROOF_MATCH_V2Q_PRIVATE_STATE_ID,
      bridgeUrl: options.qualification.bridgeUrl.replace(/\/$/, ''),
    };
  }

  return {
    service,
    privateStateProvider: providers.privateStateProvider as unknown as ProofMatchV2StateProvider,
    privateStateId: PROOF_MATCH_V2_PRIVATE_STATE_ID,
    v2q,
  };
}
