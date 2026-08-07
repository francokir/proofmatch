interface WizardStepperProps { step: 1 | 2; }
export function WizardStepper({ step }: WizardStepperProps) {
  const items = [{ label: 'Job reviewed', state: 'complete' }, { label: 'Private terms', state: step === 1 ? 'active' : 'complete' }, { label: 'Review', state: step === 2 ? 'active' : 'pending' }];
  return <ol className="wizard-stepper" aria-label={`Step ${step} of 2`}>{items.map((item, index) => <li className={`wizard-step wizard-step--${item.state}`} key={item.label}><span className="step-marker" aria-hidden="true">{item.state === 'complete' ? '✓' : index + 1}</span><span>{item.label}</span></li>)}</ol>;
}
