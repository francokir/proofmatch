import { useState } from 'react';
import { PillButton } from '../../components/PillButton';
import type { RevealField, V2Profile, V2PublicJobState, V2RevealVerdict } from '../../domain/v2';

const money = (value: bigint) => `USD ${value.toLocaleString('en-US')}`;

// ─── Privacy Receipt ─────────────────────────────────────────────────────────

/**
 * What the proof established, and what it deliberately did not.
 *
 * Every line is derived from the contract's own logic, not from copy: the
 * circuit proves the comparisons and writes only commitments and a nullifier.
 */
export function PrivacyReceiptPanel({ job, profile, credentialLevel }: {
  job: V2PublicJobState;
  profile: V2Profile;
  /** The candidate's own stored level, shown only on their own screen. */
  credentialLevel?: string | null;
}) {
  const proven = [
    `Your minimum sits at or below the published floor of ${money(job.salaryBandFloor)}, so any cap inside the band clears it.`,
    `You can cover the required ${job.requiredWeeklyHours.toString()} hours a week.`,
    `You accept ${job.workMode} work.`,
    ...(job.workMode === 'REMOTE' ? [] : ['The office is inside your commute radius.']),
    ...(job.qualification
      ? [`English ${job.qualification.requiredLevelLabel} or higher — credential-backed ✓. The circuit proved you own an opaque attestation the verifier only issues after Midnames verified your credential.`]
      : []),
    'You had not already matched this vacancy.',
  ];
  const notRevealed = [
    `Your exact minimum (${money(profile.minimumCompensation)} — shown here because it is your own screen, never sent).`,
    `Your exact availability (${profile.availableWeeklyHours.toString()} hours).`,
    'Your location and your radius.',
    ...(job.qualification
      ? [
          `Your exact English level${credentialLevel ? ` (${credentialLevel} — your own screen only)` : ''} and your full credential.`,
          'Which attestation backed your match: membership is proven by merkle path, not by naming the leaf.',
        ]
      : []),
    "The recruiter's exact cap, which stays a commitment.",
    'Any link between this match and one you made on another vacancy.',
  ];
  return <section className="v2-panel" aria-labelledby="v2-receipt-title">
    <header className="v2-panel__header"><h2 id="v2-receipt-title">Privacy receipt</h2><p>A plain-language reading of the transaction that is now on-chain.</p></header>
    <div className="v2-receipt">
      <div className="v2-receipt__column"><h3>Proven</h3><ul>{proven.map((line) => <li key={line}>{line}</li>)}</ul></div>
      <div className="v2-receipt__column v2-receipt__column--kept"><h3>Not revealed</h3><ul>{notRevealed.map((line) => <li key={line}>{line}</li>)}</ul></div>
    </div>
    <p className="v2-note">On-chain for this vacancy: {job.matchCount.toString()} match(es), {job.usedNullifierCount.toString()} nullifier(s), {job.salaryCommitmentCount.toString()} salary commitment(s). Counts, not identities.</p>
  </section>;
}

// ─── Ledger Lens ─────────────────────────────────────────────────────────────

/** Everything the chain actually holds for this vacancy, read from the indexer. */
export function LedgerLensV2Panel({ job, onRefresh, busy }: { job: V2PublicJobState; onRefresh: () => void; busy: boolean }) {
  const rows: Array<[string, string, 'public' | 'commitment']> = [
    ['jobId', `${job.jobId.slice(0, 20)}…`, 'public'],
    ['salaryBandFloor', job.salaryBandFloor.toString(), 'public'],
    ['salaryBandCeiling', job.salaryBandCeiling.toString(), 'public'],
    ['jobRequiredWeeklyHours', job.requiredWeeklyHours.toString(), 'public'],
    ['jobWorkMode', job.workMode, 'public'],
    ['officeX / officeY', `${job.officeX.toString()} / ${job.officeY.toString()}`, 'public'],
    ['jobState', job.jobState, 'public'],
    ['budgetLocked', String(job.budgetLocked), 'public'],
    ['employerBudgetCommitment', job.budgetLocked ? `${job.employerBudgetCommitment.slice(0, 24)}…` : '—', 'commitment'],
    ...(job.qualification
      ? ([
          ['requiredQualificationLevel', `English ${job.qualification.requiredLevelLabel} (${job.qualification.requiredLevel.toString()})`, 'public'],
          ['qualificationVerifierKey', `${job.qualification.verifierKeyHash.slice(0, 24)}…`, 'public'],
          ['qualificationAttestations', `${job.qualification.attestationCount.toString()} opaque attestation(s) — merkle nodes, no identities, no levels`, 'commitment'],
        ] as Array<[string, string, 'public' | 'commitment']>)
      : []),
    ['matchCount', job.matchCount.toString(), 'public'],
    ['usedNullifiers', job.usedNullifierCount.toString(), 'commitment'],
    ['candidateSalaryCommitments', job.salaryCommitmentCount.toString(), 'commitment'],
    ['candidateHoursCommitments', job.hoursCommitmentCount.toString(), 'commitment'],
  ];
  return <section className="v2-panel" aria-labelledby="v2-lens-title">
    <header className="v2-panel__header"><h2 id="v2-lens-title">Ledger lens</h2><p>Read live from the indexer. Look for what is missing: no salary, no hours, no location, no identity{job.qualification ? ', no credential, no exact English level' : ''}.</p></header>
    <table className="v2-lens"><tbody>{rows.map(([field, value, kind]) => <tr key={field}><th scope="row">{field}</th><td><code>{value}</code></td><td><span className={`v2-tag v2-tag--${kind}`}>{kind === 'public' ? 'public term' : 'commitment / hash'}</span></td></tr>)}</tbody></table>
    <div className="v2-actions"><button type="button" className="v2-secondary" onClick={onRefresh}>{busy ? 'Reading…' : 'Refresh from chain'}</button><code className="v2-address">{job.contractAddress}</code></div>
  </section>;
}

// ─── Consent Reveal ──────────────────────────────────────────────────────────

const FIELD_LABEL: Record<RevealField, string> = {
  candidateSalary: 'My exact minimum salary',
  candidateHours: 'My exact weekly hours',
  employerSalaryCap: "The recruiter's exact cap",
};

export type CredentialPresentationVerdict =
  | { verified: true; holderDid: string; englishLevelLabel: string; issuerName: string; credentialId: string }
  | { verified: false; reason: string };

export function ConsentRevealPanel({ onCreate, onVerify, canReveal, credential }: {
  onCreate: (field: RevealField) => Promise<string>;
  onVerify: (transport: string) => Promise<V2RevealVerdict>;
  canReveal: boolean;
  /** Credential presentation flow. Absent when no bridge / no qualification. */
  credential?: {
    hasCredential: boolean;
    present: () => Promise<string>;
    verify: (transport: string) => Promise<CredentialPresentationVerdict>;
  };
}) {
  const [field, setField] = useState<RevealField>('candidateSalary');
  const [transport, setTransport] = useState('');
  const [inbox, setInbox] = useState('');
  const [verdict, setVerdict] = useState<V2RevealVerdict | null>(null);
  const [error, setError] = useState('');
  const [vpTransport, setVpTransport] = useState('');
  const [vpInbox, setVpInbox] = useState('');
  const [vpVerdict, setVpVerdict] = useState<CredentialPresentationVerdict | null>(null);

  const create = async () => {
    setError(''); setVerdict(null);
    try { setTransport(await onCreate(field)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The reveal could not be built.'); }
  };
  const verify = async () => {
    setError(''); setVerdict(null);
    try { setVerdict(await onVerify(inbox)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The package could not be checked.'); }
  };
  const presentCredential = async () => {
    setError(''); setVpVerdict(null);
    try { setVpTransport(await credential!.present()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The presentation could not be built.'); }
  };
  const verifyCredential = async () => {
    setError(''); setVpVerdict(null);
    try { setVpVerdict(await credential!.verify(vpInbox)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The presentation could not be checked.'); }
  };

  return <section className="v2-panel" aria-labelledby="v2-reveal-title">
    <header className="v2-panel__header"><h2 id="v2-reveal-title">Consent reveal</h2><p>The match proved a comparison without disclosing the numbers. If both sides now want to talk figures, one side hands over a single field and the other checks it against the commitment already on-chain.</p></header>

    <div className="v2-reveal">
      <div className="v2-reveal__column">
        <h3>Disclose one field</h3>
        <label className="v2-field"><span className="v2-field__label">Field</span><select className="v2-field__input" value={field} onChange={(event) => setField(event.target.value as RevealField)}>{(Object.keys(FIELD_LABEL) as RevealField[]).map((entry) => <option key={entry} value={entry}>{FIELD_LABEL[entry]}</option>)}</select></label>
        <PillButton onClick={() => void create()}>Build reveal</PillButton>
        {!canReveal && <p className="v2-note v2-note--muted">A candidate reveal needs a match made in this session, so the browser knows which one is yours.</p>}
        {transport && <><p className="v2-note v2-note--ok">Send this to the other side. It carries the one field you chose and nothing else.</p><textarea className="v2-transport" readOnly rows={4} value={transport} /></>}
      </div>

      <div className="v2-reveal__column">
        <h3>Check a disclosure</h3>
        <textarea className="v2-transport" rows={4} placeholder="Paste a reveal package" value={inbox} onChange={(event) => setInbox(event.target.value)} />
        <PillButton onClick={() => void verify()}>Verify against the ledger</PillButton>
        {verdict?.verified === true && <p className="v2-note v2-note--ok">Verified: {FIELD_LABEL[verdict.field]} is {verdict.value.toString()}. The commitment on-chain matches.</p>}
        {verdict?.verified === false && <p className="v2-note v2-note--warn">Rejected — {verdict.reason}</p>}
      </div>
    </div>

    {credential && <div className="v2-reveal">
      <div className="v2-reveal__column">
        <h3>Present the English credential</h3>
        <p className="v2-note">The match only proved <em>“requirement satisfied”</em>. If you now WANT the recruiter to see the credential itself — exact level included — sign a fresh presentation. Midnames has no partial disclosure: presenting reveals the full credential, and only this button does it.</p>
        <PillButton onClick={() => void presentCredential()}>{credential.hasCredential ? 'Consent & build presentation' : 'No credential stored'}</PillButton>
        {vpTransport && <><p className="v2-note v2-note--ok">Hand this to the recruiter. It is signed against a single-use challenge, so it cannot be replayed.</p><textarea className="v2-transport" readOnly rows={4} value={vpTransport} /></>}
      </div>
      <div className="v2-reveal__column">
        <h3>Verify a presented credential</h3>
        <textarea className="v2-transport" rows={4} placeholder="Paste a credential presentation" value={vpInbox} onChange={(event) => setVpInbox(event.target.value)} />
        <PillButton onClick={() => void verifyCredential()}>Verify via Midnames</PillButton>
        {vpVerdict?.verified === true && <p className="v2-note v2-note--ok">Verified by Midnames (signature, issuer DID, holder binding, revocation): <strong>English {vpVerdict.englishLevelLabel}</strong>, issued by {vpVerdict.issuerName}.</p>}
        {vpVerdict?.verified === false && <p className="v2-note v2-note--warn">Rejected — {vpVerdict.reason}</p>}
      </div>
    </div>}
    {error && <p className="v2-note v2-note--warn">{error}</p>}
  </section>;
}
