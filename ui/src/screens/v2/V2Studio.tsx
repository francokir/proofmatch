import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProofTimeline } from '../../components/ProofTimeline';
import type { ProofFlowStep } from '../../domain/private-match';
import { EmployerPanel, JobBoardPanel, ProfilePanel } from './V2Panels';
import { ConsentRevealPanel, LedgerLensV2Panel, PrivacyReceiptPanel } from './V2PostMatch';
import type {
  ProofFlowStatus,
  ProofMatchV2UiApi,
  RevealField,
  V2Profile,
  V2PublicJobState,
  WalletStatus,
} from '../../domain/v2';

type Step = 'recruiter' | 'profile' | 'board' | 'receipt' | 'lens' | 'reveal';
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'recruiter', label: 'Recruiter' },
  { id: 'profile', label: 'Profile' },
  { id: 'board', label: 'Job board' },
  { id: 'receipt', label: 'Privacy receipt' },
  { id: 'lens', label: 'Ledger lens' },
  { id: 'reveal', label: 'Consent reveal' },
];

const JOB_REGISTRY_KEY = 'proofmatch.v2.known-jobs';

/** The stages a V2 submission goes through, mapped from the facade's status. */
const PROOF_STAGES: Array<{ id: ProofFlowStatus; label: string; description: string }> = [
  { id: 'proof_generating', label: 'Generating the zero-knowledge proof', description: 'Runs on your local proof server. This is the slow part.' },
  { id: 'indexing_pending', label: 'Waiting for the indexer', description: 'The transaction is on-chain; the read side is catching up.' },
];

function proofSteps(status: ProofFlowStatus): ProofFlowStep[] {
  const order: ProofFlowStatus[] = ['proof_generating', 'indexing_pending'];
  const current = order.indexOf(status);
  return PROOF_STAGES.map((stage, index) => ({
    id: stage.id as ProofFlowStep['id'],
    label: stage.label,
    description: stage.description,
    status: status === 'failed' ? (index === Math.max(current, 0) ? 'failed' : 'pending')
      : status === 'confirmed' ? 'completed'
      : index < current ? 'completed' : index === current ? 'active' : 'pending',
  }));
}

/** Vacancies this browser knows about. Public addresses, not secrets. */
function loadRegistry(seed: readonly string[]): string[] {
  let stored: string[] = [];
  try {
    const raw = window.localStorage.getItem(JOB_REGISTRY_KEY);
    if (raw) stored = JSON.parse(raw) as string[];
  } catch {
    stored = [];
  }
  return [...new Set([...seed, ...stored])];
}

function saveRegistry(addresses: readonly string[]): void {
  window.localStorage.setItem(JOB_REGISTRY_KEY, JSON.stringify(addresses));
}

function walletLabel(status: WalletStatus): string {
  return status === 'connecting' ? 'Connecting…'
    : status === 'connected' ? 'Wallet connected'
    : status === 'connection_declined' ? 'Connection declined'
    : status === 'detected' ? 'Connect wallet'
    : 'Wallet not detected';
}

export function V2Studio({ api, seedJobs }: { api: ProofMatchV2UiApi; seedJobs: readonly string[] }) {
  const [step, setStep] = useState<Step>('recruiter');
  const [walletStatus, setWalletStatus] = useState<WalletStatus>(api.wallet.status);
  const [registry, setRegistry] = useState<string[]>(() => loadRegistry(seedJobs));
  const [jobs, setJobs] = useState<V2PublicJobState[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<V2Profile | null>(null);
  const [proofStatus, setProofStatus] = useState<ProofFlowStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [addressDraft, setAddressDraft] = useState('');

  const connected = walletStatus === 'connected';

  const report = (step: string, cause: unknown) => {
    // Names and messages only, walking the cause chain. Private terms, the
    // candidate secret and the openings never reach the console.
    const chain: string[] = [];
    for (let current = cause, depth = 0; current instanceof Error && depth < 5; depth += 1) {
      chain.push(`${current.name}: ${current.message}`);
      current = current.cause;
    }
    console.error(`[ProofMatch V2] ${step} failed —`, chain.join(' <- ') || String(cause));
    setError(chain[0] ?? 'Something went wrong. Your private values remain local.');
  };

  useEffect(() => api.subscribeProofStatus(setProofStatus), [api]);
  useEffect(() => {
    let active = true;
    void api.wallet.detectWallet().then((status) => { if (active) setWalletStatus(status); }).catch(() => undefined);
    return () => { active = false; };
  }, [api]);
  useEffect(() => { void api.loadProfile().then(setProfile).catch(() => undefined); }, [api]);

  const refreshJobs = useCallback(async (addresses: readonly string[]) => {
    if (!connected) return;
    const read = await Promise.all(addresses.map(async (address) => {
      try { return await api.refreshJob(address); } catch { return null; }
    }));
    setJobs(read.filter((job): job is V2PublicJobState => job !== null));
  }, [api, connected]);

  useEffect(() => { void refreshJobs(registry); }, [refreshJobs, registry]);

  const rememberJob = (address: string) => {
    setRegistry((current) => {
      const next = [...new Set([...current, address])];
      saveRegistry(next);
      return next;
    });
  };

  const selectedJob = useMemo(
    () => jobs.find((job) => job.contractAddress === selected) ?? null,
    [jobs, selected],
  );
  const previews = useMemo(
    () => (profile === null ? [] : api.previewJobs(jobs, profile)),
    [api, jobs, profile],
  );
  const matchedJob = useMemo(
    () => jobs.find((job) => job.contractAddress === matched) ?? null,
    [jobs, matched],
  );

  const guard = async (label: string, action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (cause) { report(label, cause); } finally { setBusy(false); }
  };

  const connect = () => void guard('wallet connection', async () => {
    const request = api.wallet.connectWallet();
    setWalletStatus(api.wallet.status);
    await request;
    setWalletStatus(api.wallet.status);
  });

  return <main className="v2-studio" id="v2">
    <header className="v2-studio__header">
      <div><span className="section-kicker">ProofMatch V2</span><h1>Prove the fit. Disclose nothing.</h1><p>A recruiter commits to a budget without publishing it. A candidate proves a match without revealing their terms. Both sides can later disclose one field, on purpose.</p></div>
      <button type="button" className="wallet-action" disabled={walletStatus === 'connecting' || connected} onClick={connect}>{walletLabel(walletStatus)}</button>
    </header>

    {!connected && <p className="v2-note v2-note--warn">Connect the wallet to read the ledger and submit proofs. Everything below stays inert until then.</p>}
    {error && <p className="ui-safe-error" role="status">{error}</p>}

    <nav className="v2-steps" aria-label="ProofMatch V2 sections">{STEPS.map((entry) => <button key={entry.id} type="button" className={`v2-step${step === entry.id ? ' v2-step--active' : ''}`} aria-current={step === entry.id ? 'step' : undefined} onClick={() => setStep(entry.id)}>{entry.label}</button>)}</nav>

    <div className="v2-address-bar">
      <label className="v2-field v2-field--wide"><span className="v2-field__label">Add a vacancy by address</span><input className="v2-field__input" value={addressDraft} onChange={(event) => setAddressDraft(event.target.value)} placeholder="contract address" /></label>
      <button type="button" className="v2-secondary" onClick={() => { const address = addressDraft.trim(); if (address) { rememberJob(address); setAddressDraft(''); } }}>Track</button>
      <button type="button" className="v2-secondary" onClick={() => void refreshJobs(registry)}>{busy ? 'Reading…' : 'Refresh all'}</button>
    </div>

    {proofStatus !== 'idle' && <ProofTimeline steps={proofSteps(proofStatus)} />}

    {step === 'recruiter' && <EmployerPanel
      busy={busy}
      job={selectedJob}
      onDeploy={(input) => void guard('publishing the vacancy', async () => {
        const address = await api.deployJob(input);
        rememberJob(address);
        setSelected(address);
        await refreshJobs([...registry, address]);
      })}
      onLock={(cap) => void guard('locking the budget', async () => {
        if (!selectedJob) return;
        await api.lockPrivateBudget(selectedJob.contractAddress, cap);
        await refreshJobs(registry);
      })}
    />}

    {step === 'profile' && <ProfilePanel
      profile={profile}
      onSave={(next) => void guard('saving the profile', async () => { setProfile(await api.saveProfile(next)); })}
      onClear={() => void guard('clearing the profile', async () => { await api.clearProfile(); setProfile(null); })}
    />}

    {step === 'board' && (profile === null
      ? <section className="v2-panel"><p className="v2-note">Fill the Private Match Profile first — the board classifies vacancies against it, locally.</p></section>
      : <JobBoardPanel
          previews={previews}
          busy={busy}
          selected={selected}
          onSelect={setSelected}
          onProve={(address) => void guard('the private match', async () => {
            if (!profile) return;
            await api.proveGuaranteedMatch(address, profile);
            setMatched(address);
            setSelected(address);
            await refreshJobs(registry);
            setStep('receipt');
          })}
        />)}

    {step === 'receipt' && (matchedJob && profile
      ? <PrivacyReceiptPanel job={matchedJob} profile={profile} />
      : <section className="v2-panel"><p className="v2-note">No match yet in this session. Prove one from the job board and the receipt appears here.</p></section>)}

    {step === 'lens' && (selectedJob
      ? <LedgerLensV2Panel job={selectedJob} busy={busy} onRefresh={() => void refreshJobs(registry)} />
      : <section className="v2-panel"><p className="v2-note">Pick a vacancy on the job board to inspect what it publishes.</p></section>)}

    {step === 'reveal' && (selectedJob
      ? <ConsentRevealPanel
          canReveal={matched === selectedJob.contractAddress}
          onCreate={async (field: RevealField) => (await api.createReveal(selectedJob.contractAddress, field)).transport}
          onVerify={(transport) => api.verifyReveal(transport, selectedJob.contractAddress)}
        />
      : <section className="v2-panel"><p className="v2-note">Pick a vacancy first: a reveal is always checked against one vacancy's commitments.</p></section>)}

    {selectedJob && <p className="v2-note v2-note--muted">Selected vacancy <code>{selectedJob.contractAddress.slice(0, 24)}…</code>{matched === selectedJob.contractAddress ? ' · matched in this session' : ''} · <button type="button" className="v2-linkish" onClick={() => void guard('the demo reset', async () => { await api.resetCandidate(selectedJob.contractAddress); setMatched(null); await refreshJobs(registry); })}>reset candidate state</button></p>}
  </main>;
}
