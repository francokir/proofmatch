import type { JobDetail } from '../domain/job';
import { PillButton } from './PillButton';

interface JobTermsCardProps { job: JobDetail; onPrivateMatch: () => void; }

export function JobTermsCard({ job, onPrivateMatch }: JobTermsCardProps) {
  return <aside className="job-terms-card" aria-labelledby="terms-heading">
    <div className="card-overline"><span className="overline-dot" aria-hidden="true" /> Match conditions</div>
    <h2 id="terms-heading">A private way to check the fit.</h2>
    <dl className="job-terms">
      <div><dt>Suggested compensation</dt><dd>{job.suggestedCompensation}</dd><small>A reference to help you choose your private minimum.</small></div>
      <div><dt>Required availability</dt><dd>{job.requiredWeeklyHours}</dd></div>
    </dl>
    <div className="terms-privacy"><strong>What stays private</strong><p>Your exact compensation and availability stay private.</p><p>Only the compatibility result is shared.</p></div>
    <PillButton onClick={onPrivateMatch}>Check private compatibility <span aria-hidden="true">↗</span></PillButton>
    <p className="terms-caption">Visual product shell — no check is run from this screen.</p>
  </aside>;
}
