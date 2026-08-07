import { useMemo, useState } from 'react';
import { PillButton } from '../components/PillButton';
import { ProofTimeline } from '../components/ProofTimeline';
import { novaLabsJob } from '../demo-data/nova-labs-job';
import type { ProofFlowError, ProofFlowStep, ProofProgressProps, ProofProgressStatus } from '../domain/private-match';

const flow: Array<Pick<ProofFlowStep, 'id' | 'label' | 'description'>> = [
  { id: 'preparing', label: 'Preparing private inputs', description: 'Preparing your private compensation and availability values for the compatibility check.' },
  { id: 'generating-proof', label: 'Generating zero-knowledge proof', description: 'ProofMatch will prove compatibility without revealing your exact private values.' },
  { id: 'awaiting-wallet', label: 'Waiting for Lace authorization', description: 'The proof flow is ready for wallet authorization.' },
  { id: 'submitting', label: 'Submitting match', description: 'After authorization, the valid match will be submitted for public registration.' },
  { id: 'indexing', label: 'Waiting for public confirmation', description: 'Waiting for the public state to reflect the verified match.' },
];

const errors: Record<ProofFlowError, { title: string; message: string }> = {
  'proof-generation': { title: 'Proof generation failed', message: 'Nothing was submitted and your private values remain local.' },
  'wallet-unavailable': { title: 'Wallet unavailable', message: 'No authorization was requested and your private values remain local.' },
  'wallet-declined': { title: 'Wallet connection declined', message: 'Nothing was submitted and your private values remain local.' },
  submission: { title: 'Submission failed', message: 'Your private values remain local. No public result was created.' },
  'confirmation-delayed': { title: 'Public confirmation delayed', message: 'The visual demo has not received a public confirmation yet.' },
};

const statusIndex: Record<Exclude<ProofProgressStatus, 'confirmed' | 'failed'>, number> = {
  idle: 0,
  proof_generating: 1,
  signature_pending: 2,
  transaction_pending: 3,
  indexing_pending: 4,
};

export function ProofProgressScreen({ status, error: externalError, onRetry, onCancel, onComplete, onReset }: ProofProgressProps) {
  const [demoIndex, setDemoIndex] = useState(0);
  const [demoError, setDemoError] = useState<ProofFlowError | null>(null);
  const controlled = status !== undefined;
  const index = controlled && status !== 'confirmed' && status !== 'failed' ? statusIndex[status] : demoIndex;
  const error = controlled ? status === 'failed' ? externalError ?? 'proof-generation' : null : demoError;
  const complete = controlled ? status === 'confirmed' : demoIndex === flow.length;
  const active = complete ? undefined : flow[index];
  const steps = useMemo<ProofFlowStep[]>(() => flow.map((item, itemIndex) => ({ ...item, status: error && itemIndex === index ? 'failed' : itemIndex < index ? 'completed' : itemIndex === index ? 'active' : 'pending' })), [index, error]);

  const retry = () => {
    if (!controlled) setDemoError(null);
    onRetry();
  };
  const next = () => {
    if (error) return;
    if (complete) onComplete();
    else setDemoIndex((value) => Math.min(value + 1, flow.length));
  };
  const resetDemo = () => {
    setDemoIndex(0);
    setDemoError(null);
    onReset?.();
  };
  const title = error ? errors[error].title : complete ? 'Compatibility check complete' : active!.label;
  const description = error ? errors[error].message : complete ? 'Next: Match Pass. This visual flow is ready for the next product surface.' : active!.description;

  return <main className="proof-page" aria-labelledby="proof-title"><section className="proof-intro"><button className="breadcrumb" type="button" onClick={onCancel}>← <span>Back to private terms</span></button><div><span className="demo-flow-badge">Demo flow</span><p>Private compatibility check</p><h1 id="proof-title">{novaLabsJob.title}</h1><small>{novaLabsJob.company}</small></div><span className="proof-disclaimer">Visual preview — real proof states will be connected to the Midnight integration.</span></section><section className="proof-layout"><aside className="proof-rail"><ProofTimeline steps={steps} /><section className="proof-privacy-summary"><span>Private</span><p>Candidate minimum compensation</p><p>Candidate weekly availability</p><p>Candidate secret</p></section></aside><section className="proof-detail" aria-live="polite"><p className="wizard-overline">{complete ? 'Demo flow complete' : error ? 'Demo error state' : `Step ${index + 1} of 5`}</p><h2>{title}</h2><p className="proof-description">{description}</p>{error ? <ErrorDetail onRetry={retry} onBack={onCancel} /> : complete ? <Completion onComplete={onComplete} /> : <StepDetail step={active!} />}{!controlled && <DemoControls index={index} complete={complete} error={error} onPrevious={() => { setDemoError(null); setDemoIndex((value) => Math.max(0, value - 1)); }} onNext={next} onError={() => setDemoError(index === 1 ? 'proof-generation' : index === 2 ? 'wallet-unavailable' : index === 3 ? 'submission' : index === 4 ? 'confirmation-delayed' : 'proof-generation')} onReset={resetDemo} />}</section></section></main>;
}

function StepDetail({ step }: { step: Pick<ProofFlowStep, 'id'> }) {
  const cards = step.id === 'preparing' ? ['Minimum compensation prepared', 'Weekly availability prepared'] : step.id === 'generating-proof' ? ['Private compensation condition — demo proof step', 'Private availability condition — preparing check', 'Job-specific uniqueness — will be verified by the real integration'] : step.id === 'awaiting-wallet' ? ['Wallet authorization — demo state', 'Awaiting user approval — no wallet popup is open'] : step.id === 'submitting' ? ['Compatibility result — preparing submission', 'Job-specific match reference — pending'] : ['Match registration — pending', 'Public confirmation — demo state'];
  return <><div className="proof-status-cards">{cards.map((card) => <article key={card}><span>{step.id === 'preparing' ? '✓' : '○'}</span><p>{card}</p></article>)}</div><section className="proof-detail-privacy"><strong>{step.id === 'awaiting-wallet' ? 'Wallet authorization' : 'Your values stay private'}</strong><p>{step.id === 'submitting' ? 'Exact private values are not part of the public result.' : 'Your exact compensation and availability are not being shown to the recruiter.'}</p></section></>;
}

function ErrorDetail({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return <div className="proof-error-actions"><PillButton onClick={onRetry}>Try again</PillButton><button className="secondary-action" type="button" onClick={onBack}>Back to private terms</button></div>;
}

function Completion({ onComplete }: { onComplete: () => void }) {
  return <section className="proof-complete"><span>✓</span><p>The demo check reached its final visual state. Match Pass is the next screen.</p><PillButton onClick={onComplete}>Continue to Match Pass <span aria-hidden="true">→</span></PillButton></section>;
}

function DemoControls({ index, complete, error, onPrevious, onNext, onError, onReset }: { index: number; complete: boolean; error: ProofFlowError | null; onPrevious: () => void; onNext: () => void; onError: () => void; onReset: () => void }) {
  return <section className="demo-controls" aria-label="Demo controls"><span>Demo controls</span><div><button type="button" onClick={onPrevious} disabled={index === 0}>Previous step</button><button type="button" onClick={onNext} disabled={Boolean(error)}>{complete ? 'Continue' : 'Next step'}</button><button type="button" onClick={onError} disabled={complete || Boolean(error)}>Simulate error</button><button type="button" onClick={onReset}>Reset</button></div></section>;
}
