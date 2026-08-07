import { JobTermsCard } from '../components/JobTermsCard';
import { novaLabsJob } from '../demo-data/nova-labs-job';

interface JobDetailScreenProps { onBack: () => void; onPrivateMatch: () => void; }

export function JobDetailScreen({ onBack, onPrivateMatch }: JobDetailScreenProps) {
  const job = novaLabsJob;
  return <main className="job-page" aria-labelledby="job-title">
    <section className="job-hero">
      <button className="breadcrumb" type="button" onClick={onBack}>← <span>All demo jobs</span></button>
      <div className="job-company-mark" aria-hidden="true"><span>NL</span></div>
      <p className="job-company">{job.company}</p>
      <h1 id="job-title">{job.title}</h1>
      <div className="job-badges" aria-label="Job details"><span>{job.location}</span><span>{job.mode}</span><span>{job.employmentType}</span><span className="status-open"><i aria-hidden="true" />{job.status}</span></div>
    </section>
    <section className="job-layout">
      <article className="job-content">
        <p className="job-content-kicker">Role overview</p>
        <h2>About the role</h2>
        <p className="job-lead">{job.description}</p>
        <div className="job-divider" />
        <h2>What you'll work on</h2>
        <ul className="responsibility-list">{job.responsibilities.map((responsibility) => <li key={responsibility}>{responsibility}</li>)}</ul>
        <section className="privacy-explainer" aria-labelledby="helps-heading">
          <p className="job-content-kicker">How ProofMatch helps</p>
          <h2 id="helps-heading">Less disclosure, more clarity.</h2>
          <div><p><strong>Private</strong><span>Your exact requested compensation and availability.</span></p><p><strong>Shared</strong><span>Compatibility result only.</span></p></div>
        </section>
      </article>
      <JobTermsCard job={job} onPrivateMatch={onPrivateMatch} />
    </section>
  </main>;
}
