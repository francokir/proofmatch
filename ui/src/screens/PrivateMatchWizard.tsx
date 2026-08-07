import { useEffect, useRef, useState } from 'react';
import { PillButton } from '../components/PillButton';
import { WizardStepper } from '../components/WizardStepper';
import { novaLabsJob } from '../demo-data/nova-labs-job';
import { privateMatchDemoPresets } from '../demo-data/private-match-presets';
import type { CandidatePrivateTerms, PrivateMatchWizardProps } from '../domain/private-match';

const initialTerms: CandidatePrivateTerms = { minimumCompensation: 1000, availableWeeklyHours: 20 };
const quickMinimums = [
  { label: '-20%', value: 800 },
  { label: '-10%', value: 900 },
  { label: 'Suggested', value: 1000 },
  { label: '+10%', value: 1100 },
  { label: '+20%', value: 1200 },
];

export function PrivateMatchWizard({ initialValues = initialTerms, onBack, onStartPrivateCheck }: PrivateMatchWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [terms, setTerms] = useState(initialValues);
  const [showValues, setShowValues] = useState(true);
  const [errors, setErrors] = useState<{ compensation?: string; availability?: string }>({});
  const [changingStep, setChangingStep] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const validate = () => {
    const next = {
      compensation: terms.minimumCompensation > 0 ? undefined : 'Enter an amount greater than zero.',
      availability: terms.availableWeeklyHours > 0 && terms.availableWeeklyHours <= 168 ? undefined : 'Enter between 1 and 168 hours.',
    };
    setErrors(next);
    return !next.compensation && !next.availability;
  };

  const transitionToStep = (next: 1 | 2) => {
    if (changingStep || next === step) return;
    setChangingStep(true);
    timer.current = window.setTimeout(() => {
      setStep(next);
      setChangingStep(false);
    }, 140);
  };

  return (
    <main className="wizard-page" aria-labelledby="wizard-title">
      <section className="wizard-intro">
        <button className="breadcrumb" type="button" onClick={onBack}>← <span>Back to job</span></button>
        <div className="wizard-job-context">
          <span>Private match</span>
          <p>{novaLabsJob.title}</p>
          <small>{novaLabsJob.company}</small>
        </div>
        <div className="wizard-step-count">Step {step} of 2</div>
      </section>
      <div className="wizard-layout">
        <aside className="wizard-rail">
          <WizardStepper step={step} />
          <div className="wizard-rail-note">
            <span>Private check</span>
            <p>A guided review before a future private check.</p>
          </div>
        </aside>
        <section className="wizard-card">
          <WizardStepper step={step} />
          <div className={`wizard-step-transition${changingStep ? ' wizard-step-transition--leaving' : ''}`}>
            {step === 1 ? (
              <TermsStep terms={terms} errors={errors} onTerms={setTerms} onBack={onBack} onContinue={() => validate() && transitionToStep(2)} />
            ) : (
              <ReviewStep terms={terms} showValues={showValues} onToggle={() => setShowValues(!showValues)} onBack={() => transitionToStep(1)} onStart={() => onStartPrivateCheck(terms)} />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function TermsStep({ terms, errors, onTerms, onBack, onContinue }: {
  terms: CandidatePrivateTerms;
  errors: { compensation?: string; availability?: string };
  onTerms: (value: CandidatePrivateTerms) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const selected = quickMinimums.find((item) => item.value === terms.minimumCompensation)?.value;
  const [amountTransition, setAmountTransition] = useState<{ from: number; to: number } | null>(null);
  const amountTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(amountTimer.current), []);

  const selectQuickMinimum = (value: number) => {
    if (value !== terms.minimumCompensation) {
      setAmountTransition({ from: terms.minimumCompensation, to: value });
      window.clearTimeout(amountTimer.current);
      amountTimer.current = window.setTimeout(() => setAmountTransition(null), 200);
    }
    onTerms({ ...terms, minimumCompensation: value });
  };

  return (
    <div className="wizard-step-content">
      <p className="wizard-overline">Step 1 · Your private terms</p>
      <h1 id="wizard-title">Choose what stays yours.</h1>
      <p className="wizard-description">Use the suggested terms as a reference. These values stay in this local product demo.</p>
      <section className="suggested-term">
        <span>Suggested compensation</span>
        <strong>{novaLabsJob.suggestedCompensation}</strong>
        <p>A reference to help you choose your private minimum.</p>
      </section>
      <fieldset className="terms-fieldset">
        <legend>Choose your private minimum</legend>
        <div className="quick-minimums">
          {quickMinimums.map((item) => (
            <button
              type="button"
              key={item.label}
              className={`quick-minimum${selected === item.value ? ' quick-minimum--selected' : ''}`}
              aria-pressed={selected === item.value}
              onClick={() => selectQuickMinimum(item.value)}
            >
              <span>{item.label}</span>
              <b>USD {item.value.toLocaleString()}</b>
            </button>
          ))}
        </div>
        <label className="input-label" htmlFor="custom-compensation">Custom amount <span>Private</span></label>
        <div className={`input-shell${amountTransition ? ' input-shell--amount-animating' : ''}`}>
          <span>USD</span>
          <div className="amount-input-wrap">
            <input
              id="custom-compensation"
              type="number"
              min="1"
              inputMode="numeric"
              value={terms.minimumCompensation}
              onChange={(event) => onTerms({ ...terms, minimumCompensation: Number(event.target.value) })}
              aria-describedby={errors.compensation ? 'compensation-error' : undefined}
            />
            {amountTransition && (
              <span className="amount-value-motion" aria-hidden="true">
                <span className="amount-value-motion__out">{amountTransition.from}</span>
                <span className="amount-value-motion__in">{amountTransition.to}</span>
              </span>
            )}
          </div>
        </div>
        {errors.compensation && <p className="field-error" id="compensation-error">{errors.compensation}</p>}
      </fieldset>
      <fieldset className="terms-fieldset availability-field">
        <legend>Weekly availability</legend>
        <label className="input-label" htmlFor="weekly-availability">Hours you can commit <span>Private</span></label>
        <div className="input-shell">
          <input id="weekly-availability" type="number" min="1" max="168" inputMode="numeric" value={terms.availableWeeklyHours} onChange={(event) => onTerms({ ...terms, availableWeeklyHours: Number(event.target.value) })} aria-describedby={errors.availability ? 'availability-error' : undefined} />
          <span>hours / week</span>
        </div>
        {errors.availability && <p className="field-error" id="availability-error">{errors.availability}</p>}
      </fieldset>
      <PrivacyCard />
      <section className="demo-presets">
        <span>Demo presets</span>
        <p>Fills local demo values only. No match is checked.</p>
        <div>
          {privateMatchDemoPresets.map((preset) => (
            <button type="button" key={preset.id} onClick={() => onTerms(preset)}>
              <b>{preset.label}</b>
              <small>{preset.minimumCompensation} / {preset.availableWeeklyHours} h</small>
            </button>
          ))}
        </div>
      </section>
      <Actions onBack={onBack} onNext={onContinue} label="Continue" />
    </div>
  );
}

function PrivacyCard() {
  return <section className="privacy-terms-card" aria-label="Your private values"><p>Your values stay private</p><span>Your exact minimum compensation and weekly availability are not shared with the recruiter.</span><strong>Only the compatibility result will be shared.</strong><div><b>⌾ Minimum compensation <i>Private</i></b><b>⌾ Weekly availability <i>Private</i></b></div></section>;
}

function ReviewStep({ terms, showValues, onToggle, onBack, onStart }: {
  terms: CandidatePrivateTerms;
  showValues: boolean;
  onToggle: () => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const compensation = showValues ? `USD ${terms.minimumCompensation.toLocaleString()}` : '••••••';
  const availability = showValues ? `${terms.availableWeeklyHours} h / week` : '••••••';

  return <div className="wizard-step-content"><p className="wizard-overline">Step 2 · Review & confirm</p><h1 id="wizard-title">Review your private check.</h1><p className="wizard-description">Make sure you're comfortable with what stays private and what will be shared.</p><section className="review-card"><span>Job</span><strong>{novaLabsJob.title}</strong><p>{novaLabsJob.company}</p></section><section className="review-inputs"><div className="review-inputs-header"><span>Your private inputs</span><button type="button" onClick={onToggle}>{showValues ? 'Hide values' : 'Show values'}</button></div><dl><div><dt>Minimum compensation</dt><dd>{compensation} <b>Private ⌾</b></dd></div><div><dt>Weekly availability</dt><dd>{availability} <b>Private ⌾</b></dd></div></dl><p>Your values are visible only in this local demo review.</p></section><section className="will-check"><span>What ProofMatch will check</span><ul><li>Your private minimum satisfies the job compensation condition</li><li>Your private availability satisfies the required weekly hours</li><li>You have not already registered a match for this job</li></ul></section><section className="sharing-grid"><article><span>Recruiter will receive</span><p>Compatibility result</p><p>Match reference/ticket after a successful check</p></article><article><span>Recruiter will not receive</span><p>Exact minimum compensation</p><p>Exact weekly availability</p><p>Candidate secret</p></article></section><Actions onBack={onBack} onNext={onStart} label="Start private check" /><p className="start-note" aria-live="polite">Starting a private check is not available in this product shell yet.</p></div>;
}

function Actions({ onBack, onNext, label }: { onBack: () => void; onNext: () => void; label: string }) {
  return <div className="wizard-actions"><button className="secondary-action" type="button" onClick={onBack}>Back</button><PillButton onClick={onNext}>{label} <span aria-hidden="true">→</span></PillButton></div>;
}
