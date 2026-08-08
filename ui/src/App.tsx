import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatedTextCycle } from './components/AnimatedTextCycle';
import { BrandMark } from './components/BrandMark';
import { MatchPreview } from './components/MatchPreview';
import { TopNavigation } from './components/TopNavigation';
import { PillButton } from './components/PillButton';
import { JobDetailScreen } from './screens/JobDetailScreen';
import { PrivateMatchWizard } from './screens/PrivateMatchWizard';
import { ProofProgressScreen } from './screens/ProofProgressScreen';
import { MatchPassScreen } from './screens/MatchPassScreen';
import { RecruiterDashboardScreen } from './screens/RecruiterDashboardScreen';
import { LedgerLensScreen } from './screens/LedgerLensScreen';
import type { CandidatePrivateTerms } from './domain/private-match';
import type { ProofFlowStatus, ProofMatchUiApi, PublicJobState, WalletStatus } from './domain/integration';
import { ledgerLensDataFromPublicState } from './domain/ledger';
import { demoProofMatchUiApi, demoContractAddress } from './demo-data/demo-proofmatch-ui-api';
import { V2Studio } from './screens/v2/V2Studio';
import type { ConfiguredProofMatchV2 } from './integration/browser-v2';
import { demoMatchPass } from './demo-data/match-pass';
import { recruiterDashboardDemo } from './demo-data/recruiter-dashboard';
import { ledgerLensDemo } from './demo-data/ledger-lens';

export type View = 'home' | 'job' | 'private-match' | 'proof-progress' | 'match-pass' | 'recruiter' | 'ledger' | 'v2';
export interface AppProps { api?: ProofMatchUiApi; contractAddress?: string; proofStatus?: ProofFlowStatus; v2?: ConfiguredProofMatchV2; }

/**
 * Prints why a step failed, without printing what the candidate typed.
 *
 * Only error names and messages cross into the console, walking the `cause`
 * chain — the SDK puts the actionable detail there. Private terms, the
 * candidate secret and the commitment openings never reach this function.
 */
function reportFailureCause(step: string, error: unknown): void {
  const chain: string[] = [];
  for (let current = error, depth = 0; current instanceof Error && depth < 5; depth += 1) {
    chain.push(`${current.name}: ${current.message}`);
    current = current.cause;
  }
  console.error(`[ProofMatch] ${step} failed —`, chain.length > 0 ? chain.join(' <- ') : String(error));
}

/** Indexer catch-up window after a transaction: 40 tries, ~2 minutes. */
const INDEXING_POLL_ATTEMPTS = 40;
const INDEXING_POLL_INTERVAL_MS = 3_000;

const principles = [['Private terms', 'Exact values stay local'], ['Zero-knowledge', 'Prove without revealing'], ['Verified match', 'Share compatibility only'], ['Candidate control', "Disclose when you're ready"]];
const heroPhrases = ['before you disclose.', 'without exposing exact terms.', 'while your conditions stay private.'];

function App({ api = demoProofMatchUiApi, contractAddress = demoContractAddress, proofStatus, v2 }: AppProps) {
  const demoMode = api === demoProofMatchUiApi;
  const [view, setView] = useState<View>('home');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [privateTerms, setPrivateTerms] = useState<CandidatePrivateTerms | null>(null);
  const [publicState, setPublicState] = useState<PublicJobState | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>(api.wallet.status);
  const [demoProofStatus, setDemoProofStatus] = useState<ProofFlowStatus>('idle');
  const [uiError, setUiError] = useState('');
  const transitionTimer = useRef<number | undefined>(undefined);
  const navigate = (nextView: View) => { if (nextView === view || isTransitioning) return; setIsTransitioning(true); transitionTimer.current = window.setTimeout(() => { setView(nextView); setIsTransitioning(false); }, 170); };
  const refreshPublicState = async () => { try { setPublicState(await api.refreshPublicState(contractAddress)); } catch { setUiError('Public state is unavailable. Your private values remain local.'); } };
  /**
   * Polls the indexer until the new match shows up.
   *
   * A transaction is not visible the instant it is submitted: the indexer needs
   * a few seconds to catch up. Reading once right after submitting reports the
   * old match count, which leaves the screen stuck on "indexing" forever even
   * though the proof and the transaction both succeeded.
   */
  const waitForIndexedMatch = async (matchCountBefore: bigint | undefined) => {
    for (let attempt = 0; attempt < INDEXING_POLL_ATTEMPTS; attempt += 1) {
      const state = await api.refreshPublicState(contractAddress);
      if (state) setPublicState(state);
      if (state && (matchCountBefore === undefined || state.matchCount > matchCountBefore)) return true;
      await new Promise((resolve) => window.setTimeout(resolve, INDEXING_POLL_INTERVAL_MS));
    }
    return false;
  };
  useEffect(() => { void api.readPublicState(contractAddress).then(setPublicState).catch(() => setUiError('Public state is unavailable. Your private values remain local.')); return () => window.clearTimeout(transitionTimer.current); }, [api, contractAddress]);
  useEffect(() => api.subscribeProofStatus(setDemoProofStatus), [api]);
  // Detection is not connection: this only looks for an injected connector, so
  // it never prompts the user. Without it the header would claim the wallet is
  // missing until someone clicks, which is indistinguishable from a real fault.
  useEffect(() => { let active = true; void api.wallet.detectWallet().then((status) => { if (active) setWalletStatus(status); }).catch(() => undefined); return () => { active = false; }; }, [api]);
  const activeProofStatus = proofStatus ?? demoProofStatus;
  const ledgerData = useMemo(() => publicState ? ledgerLensDataFromPublicState(publicState) : ledgerLensDemo, [publicState]);
  const startPrivateCheck = async (terms: CandidatePrivateTerms) => {
    setPrivateTerms(terms); setUiError(''); navigate('proof-progress');
    try {
      await api.prepareCandidatePrivateState(contractAddress, { minimumCompensation: BigInt(Math.trunc(terms.minimumCompensation)), availableWeeklyHours: BigInt(Math.trunc(terms.availableWeeklyHours)) });
      if (demoMode) { setDemoProofStatus('proof_generating'); await api.proveMatch(contractAddress); setDemoProofStatus('indexing_pending'); await refreshPublicState(); setDemoProofStatus('confirmed'); }
      else {
        const matchCountBefore = publicState?.matchCount;
        await api.proveMatch(contractAddress);
        if (!await waitForIndexedMatch(matchCountBefore)) setUiError('The proof was submitted but the indexer has not shown it yet. Refresh the recruiter view in a moment.');
      }
    } catch (error) {
      // The banner stays deliberately vague, but swallowing the cause made a
      // rejected private-state password look like a failed proof. Names and
      // messages only: never the terms, the secret or the openings.
      reportFailureCause('private check', error);
      setDemoProofStatus('failed');
      setUiError('The private check could not be completed. Your private values remain local.');
    }
  };
  const resetPrivateTerms = async () => { try { await api.resetCandidatePrivateState(contractAddress); setPrivateTerms(null); setDemoProofStatus('idle'); } catch { setUiError('Private values could not be reset. They remain local.'); } };
  const connectWallet = async () => { setUiError(''); try { const request = api.wallet.connectWallet(); setWalletStatus(api.wallet.status); await request; setWalletStatus(api.wallet.status); } catch { setWalletStatus('connection_declined'); setUiError('Wallet connection was declined. Your private values remain local.'); } };
  const context = view === 'home' ? 'Privacy-first job matching' : view === 'job' ? 'Job detail' : view === 'private-match' ? 'Private match' : view === 'proof-progress' ? 'Proof progress' : view === 'match-pass' ? 'Match pass' : view === 'recruiter' ? 'Recruiter view' : view === 'v2' ? 'ProofMatch V2' : 'Ledger lens';
  const walletLabel = walletStatus === 'connecting' ? 'Connecting…' : walletStatus === 'connected' ? 'Wallet connected' : walletStatus === 'connection_declined' ? 'Connection declined' : walletStatus === 'detected' ? 'Connect wallet' : 'Wallet not detected';

  return <div className="page-frame"><div className="site-canvas"><header className="site-header"><button className="brand brand-button" type="button" onClick={() => navigate('home')} aria-label="Go to ProofMatch home"><BrandMark /><span>ProofMatch</span></button><span className="header-context">{context}</span><button className="wallet-action" type="button" disabled={walletStatus === 'connecting' || walletStatus === 'connected'} onClick={() => void connectWallet()}>{walletLabel}</button></header>{uiError && <p className="ui-safe-error" role="status">{uiError}</p>}<div className={`screen-transition${isTransitioning ? ' screen-transition--leaving' : ''}`} aria-busy={isTransitioning}>{view === 'home' ? <main id="home"><section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" /> Privacy-first job matching</p><h1 id="hero-title">Know if the job fits <AnimatedTextCycle phrases={heroPhrases} /></h1><p className="hero-description">Check whether your private compensation and availability requirements fit a job without revealing their exact values.</p><div className="hero-actions"><PillButton onClick={() => navigate('job')}>Explore demo job <span aria-hidden="true">→</span></PillButton></div></div><div className="hero-visual" aria-label="Illustrative private job match preview"><div className="grid-orb grid-orb--large" aria-hidden="true" /><div className="grid-orb grid-orb--small" aria-hidden="true" /><MatchPreview /></div></section><section className="principles" aria-label="ProofMatch principles"><div className="principles-intro"><span className="section-kicker">ProofMatch</span><p>Protect what doesn't need to be shared.</p></div>{principles.map(([title, description]) => <article className="principle" key={title}><span className="principle-index" aria-hidden="true">✦</span><h2>{title}</h2><p>{description}</p></article>)}</section></main> : view === 'job' ? <JobDetailScreen onBack={() => navigate('home')} onPrivateMatch={() => navigate('private-match')} /> : view === 'private-match' ? <PrivateMatchWizard initialValues={privateTerms ?? undefined} onBack={() => navigate('job')} onStartPrivateCheck={startPrivateCheck} /> : view === 'proof-progress' ? <ProofProgressScreen status={activeProofStatus} onCancel={() => navigate('private-match')} onRetry={() => void startPrivateCheck(privateTerms ?? { minimumCompensation: 1000, availableWeeklyHours: 20 })} onComplete={() => navigate('match-pass')} onReset={() => void resetPrivateTerms()} /> : view === 'match-pass' ? <MatchPassScreen data={demoMatchPass} onBackToJob={() => navigate('job')} onRecruiterView={() => navigate('recruiter')} onLedgerView={() => navigate('ledger')} /> : view === 'recruiter' ? <RecruiterDashboardScreen data={recruiterDashboardDemo} publicState={publicState} onRefresh={() => void refreshPublicState()} onViewMatch={() => navigate('match-pass')} onOpenLedgerLens={() => navigate('ledger')} /> : view === 'ledger' ? <LedgerLensScreen data={ledgerData} onBack={() => navigate('recruiter')} /> : v2 ? <V2Studio api={v2.api} seedJobs={v2.seedJobs} /> : <section className="v2-panel"><p className="v2-note v2-note--warn">ProofMatch V2 needs the browser integration configured. Copy <code>ui/.env.example</code> to <code>ui/.env.local</code> and restart the dev server.</p></section>}</div></div><TopNavigation activeView={view} onNavigate={navigate} onPlaceholder={() => undefined} /></div>;
}

export default App;
