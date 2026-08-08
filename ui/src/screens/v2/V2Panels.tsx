import { useState } from 'react';
import { PillButton } from '../../components/PillButton';
import type {
  SalaryFit,
  V2CredentialSummary,
  V2DeployJobInput,
  V2JobPreview,
  V2Profile,
  V2PublicJobState,
  WorkModeName,
} from '../../domain/v2';

const WORK_MODES: WorkModeName[] = ['REMOTE', 'HYBRID', 'ONSITE'];
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const NO_REQUIREMENT = 'NONE';

/** Demo starting point. Chosen so the candidate lands in Guaranteed Match. */
export const DEMO_JOB = {
  salaryBandFloor: '1800',
  salaryBandCeiling: '2100',
  requiredWeeklyHours: '20',
  workMode: 'HYBRID' as WorkModeName,
  officeX: '1000',
  officeY: '1000',
  exactCap: '1960',
  englishRequirement: 'B2' as string,
};
export const DEMO_PROFILE = {
  minimumCompensation: '1753',
  availableWeeklyHours: '27',
  acceptedWorkModes: ['REMOTE', 'HYBRID'] as WorkModeName[],
  locationX: '1437',
  locationY: '1291',
  maximumCommuteRadius: '1234',
};

const money = (value: bigint) => `USD ${value.toLocaleString('en-US')}`;
const bigintOrNull = (text: string): bigint | null => {
  if (!/^\d+$/.test(text.trim())) return null;
  try { return BigInt(text.trim()); } catch { return null; }
};

function Field({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (next: string) => void }) {
  return <label className="v2-field"><span className="v2-field__label">{label}</span><input className="v2-field__input" inputMode="numeric" value={value} onChange={(event) => onChange(event.target.value)} />{hint && <small className="v2-field__hint">{hint}</small>}</label>;
}

// ─── Recruiter ───────────────────────────────────────────────────────────────

export function EmployerPanel({ busy, job, onDeploy, onLock, qualificationAvailable }: {
  busy: boolean;
  job: V2PublicJobState | null;
  onDeploy: (input: V2DeployJobInput) => void;
  onLock: (exactCap: bigint) => void;
  /** False when no credential bridge is configured: the selector hides. */
  qualificationAvailable: boolean;
}) {
  const [form, setForm] = useState(DEMO_JOB);
  const set = (key: keyof typeof DEMO_JOB) => (next: string) => setForm((current) => ({ ...current, [key]: next }));
  const parsed = {
    floor: bigintOrNull(form.salaryBandFloor), ceiling: bigintOrNull(form.salaryBandCeiling),
    hours: bigintOrNull(form.requiredWeeklyHours), x: bigintOrNull(form.officeX), y: bigintOrNull(form.officeY),
    cap: bigintOrNull(form.exactCap),
  };
  const bandValid = parsed.floor !== null && parsed.ceiling !== null && parsed.ceiling - parsed.floor >= 300n;
  const capInBand = job !== null && parsed.cap !== null && parsed.cap >= job.salaryBandFloor && parsed.cap <= job.salaryBandCeiling;

  return <section className="v2-panel" aria-labelledby="v2-employer-title">
    <header className="v2-panel__header"><h2 id="v2-employer-title">Recruiter · private budget</h2><p>The band is public. The exact cap never leaves this browser — only a commitment to it, and a proof that it sits inside the band.</p></header>

    {job === null ? <>
      <div className="v2-grid">
        <Field label="Band floor" hint="Public" value={form.salaryBandFloor} onChange={set('salaryBandFloor')} />
        <Field label="Band ceiling" hint="Public · at least 300 above the floor" value={form.salaryBandCeiling} onChange={set('salaryBandCeiling')} />
        <Field label="Required weekly hours" hint="Public" value={form.requiredWeeklyHours} onChange={set('requiredWeeklyHours')} />
        <Field label="Office X" hint="Metres, public" value={form.officeX} onChange={set('officeX')} />
        <Field label="Office Y" hint="Metres, public" value={form.officeY} onChange={set('officeY')} />
        <label className="v2-field"><span className="v2-field__label">Work mode</span><select className="v2-field__input" value={form.workMode} onChange={(event) => setForm((current) => ({ ...current, workMode: event.target.value as WorkModeName }))}>{WORK_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
        {qualificationAvailable && <label className="v2-field"><span className="v2-field__label">Verified qualification</span><select className="v2-field__input" value={form.englishRequirement} onChange={(event) => setForm((current) => ({ ...current, englishRequirement: event.target.value }))}><option value={NO_REQUIREMENT}>None</option>{CEFR_LEVELS.map((level) => <option key={level} value={level}>English {level} or higher</option>)}</select><small className="v2-field__hint">Credential-backed via Midnames. Candidates prove it without revealing their exact level.</small></label>}
      </div>
      {!bandValid && <p className="v2-note v2-note--warn">The contract rejects a band narrower than 300. That floor is what makes a Guaranteed Match meaningful.</p>}
      <PillButton onClick={() => bandValid && onDeploy({
        salaryBandFloor: parsed.floor!, salaryBandCeiling: parsed.ceiling!, requiredWeeklyHours: parsed.hours!,
        workMode: form.workMode, officeX: parsed.x!, officeY: parsed.y!,
        englishRequirement: qualificationAvailable && form.englishRequirement !== NO_REQUIREMENT
          ? { minimumLevelLabel: form.englishRequirement }
          : undefined,
      })}>{busy ? 'Publishing…' : 'Publish vacancy'}</PillButton>
    </> : <>
      <dl className="v2-facts">
        <div><dt>Public band</dt><dd>{money(job.salaryBandFloor)} – {money(job.salaryBandCeiling)}</dd></div>
        <div><dt>Required hours</dt><dd>{job.requiredWeeklyHours.toString()} / week</dd></div>
        <div><dt>Work mode</dt><dd>{job.workMode}</dd></div>
        {job.qualification && <div><dt>Verified qualification</dt><dd>English {job.qualification.requiredLevelLabel} or higher · credential-backed</dd></div>}
        <div><dt>Budget</dt><dd>{job.budgetLocked ? 'Locked' : 'Not locked yet'}</dd></div>
      </dl>
      {job.budgetLocked
        ? <p className="v2-note v2-note--ok">Committed on-chain as <code>{job.employerBudgetCommitment.slice(0, 24)}…</code> — a hash, not the number.</p>
        : <>
            <div className="v2-grid"><Field label="Exact maximum compensation" hint="Private · stays in this browser" value={form.exactCap} onChange={set('exactCap')} /></div>
            {!capInBand && parsed.cap !== null && <p className="v2-note v2-note--warn">The circuit requires the cap to sit inside the published band.</p>}
            <PillButton onClick={() => capInBand && onLock(parsed.cap!)}>{busy ? 'Proving…' : 'Lock private budget'}</PillButton>
          </>}
    </>}
  </section>;
}

// ─── Candidate profile ───────────────────────────────────────────────────────

export function ProfilePanel({ profile, onSave, onClear, credential, credentialAvailable, busy, onRequestCredential, onClearCredential }: {
  profile: V2Profile | null;
  onSave: (profile: V2Profile) => void;
  onClear: () => void;
  /** The credential stored in THIS browser. Never shown to recruiters. */
  credential: V2CredentialSummary | null;
  /** False when no credential bridge is configured: the section hides. */
  credentialAvailable: boolean;
  busy: boolean;
  onRequestCredential: (candidateName: string, englishLevelLabel: string) => void;
  onClearCredential: () => void;
}) {
  const [credentialForm, setCredentialForm] = useState({ name: 'Demo Candidate', level: 'C1' });
  const [form, setForm] = useState(() => profile === null ? DEMO_PROFILE : {
    minimumCompensation: profile.minimumCompensation.toString(),
    availableWeeklyHours: profile.availableWeeklyHours.toString(),
    acceptedWorkModes: [...profile.acceptedWorkModes],
    locationX: profile.locationX.toString(),
    locationY: profile.locationY.toString(),
    maximumCommuteRadius: profile.maximumCommuteRadius.toString(),
  });
  const set = (key: 'minimumCompensation' | 'availableWeeklyHours' | 'locationX' | 'locationY' | 'maximumCommuteRadius') =>
    (next: string) => setForm((current) => ({ ...current, [key]: next }));
  const toggleMode = (mode: WorkModeName) => setForm((current) => ({
    ...current,
    acceptedWorkModes: current.acceptedWorkModes.includes(mode)
      ? current.acceptedWorkModes.filter((entry) => entry !== mode)
      : [...current.acceptedWorkModes, mode],
  }));
  const values = {
    min: bigintOrNull(form.minimumCompensation), hours: bigintOrNull(form.availableWeeklyHours),
    x: bigintOrNull(form.locationX), y: bigintOrNull(form.locationY), radius: bigintOrNull(form.maximumCommuteRadius),
  };
  const complete = Object.values(values).every((value) => value !== null) && form.acceptedWorkModes.length > 0;

  return <section className="v2-panel" aria-labelledby="v2-profile-title">
    <header className="v2-panel__header"><h2 id="v2-profile-title">Candidate · Private Match Profile</h2><p>Filled once, reused for every vacancy. It stays in this browser and carries no secret, no opening and no nullifier — which is what keeps you unlinkable between jobs.</p></header>
    <div className="v2-grid">
      <Field label="Minimum compensation" value={form.minimumCompensation} onChange={set('minimumCompensation')} />
      <Field label="Available weekly hours" value={form.availableWeeklyHours} onChange={set('availableWeeklyHours')} />
      <Field label="Location X" hint="Metres" value={form.locationX} onChange={set('locationX')} />
      <Field label="Location Y" hint="Metres" value={form.locationY} onChange={set('locationY')} />
      <Field label="Maximum commute radius" hint="Metres" value={form.maximumCommuteRadius} onChange={set('maximumCommuteRadius')} />
      <fieldset className="v2-field v2-field--modes"><legend className="v2-field__label">Accepted work modes</legend><div className="v2-modes">{WORK_MODES.map((mode) => <label key={mode} className={`v2-mode${form.acceptedWorkModes.includes(mode) ? ' v2-mode--on' : ''}`}><input type="checkbox" checked={form.acceptedWorkModes.includes(mode)} onChange={() => toggleMode(mode)} />{mode}</label>)}</div></fieldset>
    </div>
    <div className="v2-actions">
      <PillButton onClick={() => complete && onSave({ minimumCompensation: values.min!, availableWeeklyHours: values.hours!, acceptedWorkModes: form.acceptedWorkModes, locationX: values.x!, locationY: values.y!, maximumCommuteRadius: values.radius! })}>Save profile</PillButton>
      <button type="button" className="v2-secondary" onClick={() => { setForm(DEMO_PROFILE); }}>Load demo values</button>
      {profile !== null && <button type="button" className="v2-secondary" onClick={onClear}>Clear profile</button>}
    </div>
    {profile !== null && <p className="v2-note v2-note--ok">Saved locally. Reloading the page keeps it.</p>}

    {credentialAvailable && <div className="v2-panel__section">
      <h3 className="v2-panel__subtitle">Verified qualifications</h3>
      {credential === null ? <>
        <p className="v2-note">For the hackathon the credential comes from a <strong>ProofMatch Demo Issuer</strong> running on Midnames — a real signed W3C credential with a real on-chain DID. Production would consume credentials from trusted institutions.</p>
        <div className="v2-grid">
          <label className="v2-field"><span className="v2-field__label">Name on the credential</span><input className="v2-field__input" value={credentialForm.name} onChange={(event) => setCredentialForm((current) => ({ ...current, name: event.target.value }))} /><small className="v2-field__hint">Lives inside your credential, in this browser. Not sent to recruiters.</small></label>
          <label className="v2-field"><span className="v2-field__label">English level</span><select className="v2-field__input" value={credentialForm.level} onChange={(event) => setCredentialForm((current) => ({ ...current, level: event.target.value }))}>{CEFR_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
        </div>
        <PillButton onClick={() => credentialForm.name.trim() && onRequestCredential(credentialForm.name.trim(), credentialForm.level)}>{busy ? 'Issuing… (deploys your holder DID)' : 'Get demo English credential'}</PillButton>
      </> : <>
        <dl className="v2-facts">
          <div><dt>English</dt><dd>{credential.englishLevelLabel} · Credential-backed ✓</dd></div>
          <div><dt>Issuer</dt><dd>{credential.issuerName}</dd></div>
          <div><dt>Stored</dt><dd>privately in this browser</dd></div>
        </dl>
        <p className="v2-note v2-note--ok">Recruiters never see this level during a match — a vacancy only learns that its requirement is satisfied, backed by an opaque on-chain attestation.</p>
        <div className="v2-actions"><button type="button" className="v2-secondary" onClick={onClearCredential}>Remove credential</button></div>
      </>}
    </div>}
  </section>;
}

// ─── Multi-job preview ───────────────────────────────────────────────────────

const FIT_LABEL: Record<SalaryFit, string> = {
  GUARANTEED: 'Guaranteed match',
  NEGOTIATION_ZONE: 'Negotiation zone',
  NO_FIT: 'No fit',
};

export function JobBoardPanel({ previews, busy, onProve, onSelect, selected }: {
  previews: readonly V2JobPreview[];
  busy: boolean;
  onProve: (contractAddress: string) => void;
  onSelect: (contractAddress: string) => void;
  selected: string | null;
}) {
  return <section className="v2-panel" aria-labelledby="v2-board-title">
    <header className="v2-panel__header"><h2 id="v2-board-title">Job board · private preview</h2><p>Classified locally against your profile. Nothing is sent and nothing is proven here — a green badge is not a match, it is a hint about which single vacancy is worth a proof.</p></header>
    {previews.length === 0
      ? <p className="v2-note">No vacancies known yet. Publish one from the recruiter panel, or add its address above.</p>
      : <ul className="v2-board">{previews.map((preview) => {
          const blockers = [
            !preview.hoursCompatible && 'hours',
            !preview.workModeAccepted && 'work mode',
            !preview.commuteCompatible && 'commute',
            preview.qualificationRequired && !preview.qualificationSatisfiable && 'verified English credential',
          ].filter(Boolean) as string[];
          return <li key={preview.contractAddress} className={`v2-job v2-job--${preview.salaryFit.toLowerCase().replace('_', '-')}${selected === preview.contractAddress ? ' v2-job--selected' : ''}`}>
            <button type="button" className="v2-job__select" onClick={() => onSelect(preview.contractAddress)} aria-pressed={selected === preview.contractAddress}>
              <span className="v2-job__badge">{FIT_LABEL[preview.salaryFit]}</span>
              <span className="v2-job__band">{money(preview.publicState.salaryBandFloor)} – {money(preview.publicState.salaryBandCeiling)}</span>
              <span className="v2-job__meta">{preview.publicState.requiredWeeklyHours.toString()}h · {preview.publicState.workMode} · {preview.publicState.budgetLocked ? 'budget locked' : 'budget open'}</span>
              {preview.publicState.qualification && <span className="v2-job__meta">Verified English {preview.publicState.qualification.requiredLevelLabel}+ required{preview.qualificationSatisfiable ? ' · your credential covers it ✓' : ''}</span>}
              <span className="v2-job__address"><code>{preview.contractAddress.slice(0, 18)}…</code></span>
            </button>
            {blockers.length > 0 && <p className="v2-job__blockers">Blocked by {blockers.join(', ')}</p>}
            {preview.canProveGuaranteedMatch
              ? <PillButton onClick={() => onProve(preview.contractAddress)}>{busy ? 'Working…' : preview.qualificationRequired ? 'Prove match + qualification' : 'Prove match'}</PillButton>
              : <p className="v2-note v2-note--muted">{!preview.publicState.budgetLocked ? 'The recruiter has not locked a budget yet.'
                : preview.qualificationRequired && !preview.qualificationSatisfiable ? 'This vacancy needs a verified English credential. Get one in the profile panel.'
                : 'Not provable as a guaranteed match.'}</p>}
          </li>;
        })}</ul>}
  </section>;
}
