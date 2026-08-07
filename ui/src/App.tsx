import { useEffect, useRef, useState } from 'react';
import { BrandMark } from './components/BrandMark';
import { MatchPreview } from './components/MatchPreview';
import { TopNavigation } from './components/TopNavigation';
import { PillButton } from './components/PillButton';
import { JobDetailScreen } from './screens/JobDetailScreen';
import { PrivateMatchWizard } from './screens/PrivateMatchWizard';
import { ProofProgressScreen } from './screens/ProofProgressScreen';
import { MatchPassScreen } from './screens/MatchPassScreen';
import type { CandidatePrivateTerms } from './domain/private-match';
import { demoMatchPass } from './demo-data/match-pass';
import { recruiterDashboardDemo } from './demo-data/recruiter-dashboard';
import { RecruiterDashboardScreen } from './screens/RecruiterDashboardScreen';
import { LedgerLensScreen } from './screens/LedgerLensScreen';
import { ledgerLensDemo } from './demo-data/ledger-lens';

export type View = 'home' | 'job' | 'private-match' | 'proof-progress' | 'match-pass' | 'recruiter' | 'ledger';

const principles = [
  ['Private terms', 'Exact values stay local'],
  ['Zero-knowledge', 'Prove without revealing'],
  ['Verified match', 'Share compatibility only'],
  ['Candidate control', "Disclose when you're ready"],
];

function App() {
  const [view, setView] = useState<View>('home');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimer = useRef<number | undefined>(undefined);
  const showDemoPlaceholder = () => window.alert('This ProofMatch flow is a visual placeholder for now.');
  const navigate = (nextView: View) => {
    if (nextView === view || isTransitioning) return;
    setIsTransitioning(true);
    transitionTimer.current = window.setTimeout(() => { setView(nextView); setIsTransitioning(false); }, 170);
  };
  useEffect(() => () => window.clearTimeout(transitionTimer.current), []);
  const goHome = () => navigate('home');
  const goJob = () => navigate('job');
  const goPrivateMatch = () => navigate('private-match');
  const goMatchPass = () => navigate('match-pass');
  const goRecruiter = () => navigate('recruiter');
  const goLedger = () => navigate('ledger');
  const [privateTerms, setPrivateTerms] = useState<CandidatePrivateTerms | null>(null);
  const startPrivateCheck = (terms: CandidatePrivateTerms) => { setPrivateTerms(terms); navigate('proof-progress'); };
  const context = view === 'home' ? 'Privacy-first job matching' : view === 'job' ? 'Job detail' : view === 'private-match' ? 'Private match' : view === 'proof-progress' ? 'Proof progress' : view === 'match-pass' ? 'Match pass' : view === 'recruiter' ? 'Recruiter view' : 'Ledger lens';

  return <div className="page-frame"><div className="site-canvas">
    <header className="site-header">
      <button className="brand brand-button" type="button" onClick={goHome} aria-label="Go to ProofMatch home"><BrandMark /><span>ProofMatch</span></button>
      <span className="header-context">{context}</span>
      <PillButton onClick={view === 'home' ? goJob : goHome}>{view === 'home' ? <>Explore demo <span aria-hidden="true">↗</span></> : <>Back home <span aria-hidden="true">←</span></>}</PillButton>
    </header>
    <div className={`screen-transition${isTransitioning ? ' screen-transition--leaving' : ''}`} aria-busy={isTransitioning}>
      {view === 'home' ? <main id="home"><section className="hero" aria-labelledby="hero-title"><div className="hero-copy"><p className="eyebrow"><span className="eyebrow-dot" aria-hidden="true" /> Privacy-first job matching</p><h1 id="hero-title">Know if the job fits before you disclose.</h1><p className="hero-description">Check whether your private compensation and availability requirements fit a job without revealing their exact values.</p><div className="hero-actions"><PillButton onClick={goJob}>Explore demo job <span aria-hidden="true">↗</span></PillButton><a className="text-button" href="#how-it-works">How it works <span aria-hidden="true">↓</span></a></div></div><div className="hero-visual" aria-label="Illustrative private job match preview"><div className="grid-orb grid-orb--large" aria-hidden="true" /><div className="grid-orb grid-orb--small" aria-hidden="true" /><MatchPreview /></div></section><section className="principles" id="how-it-works" aria-label="ProofMatch principles"><div className="principles-intro"><span className="section-kicker">ProofMatch</span><p>Protect what doesn't need to be shared.</p></div>{principles.map(([title, description]) => <article className="principle" key={title}><span className="principle-index" aria-hidden="true">✦</span><h2>{title}</h2><p>{description}</p></article>)}</section></main> : view === 'job' ? <JobDetailScreen onBack={goHome} onPrivateMatch={goPrivateMatch} /> : view === 'private-match' ? <PrivateMatchWizard initialValues={privateTerms ?? undefined} onBack={goJob} onStartPrivateCheck={startPrivateCheck} /> : view === 'proof-progress' ? <ProofProgressScreen onCancel={goPrivateMatch} onRetry={() => undefined} onComplete={goMatchPass} /> : view === 'match-pass' ? <MatchPassScreen data={demoMatchPass} onBackToJob={goJob} onRecruiterView={goRecruiter} onLedgerView={goLedger} /> : view === 'recruiter' ? <RecruiterDashboardScreen data={recruiterDashboardDemo} onViewMatch={goMatchPass} onOpenLedgerLens={goLedger} /> : <LedgerLensScreen data={ledgerLensDemo} onBack={goRecruiter} />}
    </div>
  </div><TopNavigation activeView={view} onNavigate={navigate} onPlaceholder={showDemoPlaceholder} /></div>;
}

export default App;
