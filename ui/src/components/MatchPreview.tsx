export function MatchPreview() {
  return (
    <div className="match-composition">
      <aside className="float-card float-card--private">
        <span className="float-icon">⌾</span>
        <div><strong>Private</strong><span>Exact terms stay hidden</span></div>
      </aside>

      <article className="match-card">
        <header className="match-card__header">
          <span>Private match</span>
          <span className="demo-label">Demo view</span>
        </header>
        <div className="role-block">
          <p>AI Engineering Intern</p>
          <span>Nova Labs</span>
        </div>
        <dl className="terms-list">
          <div><dt>Suggested compensation</dt><dd>USD 1,000 <small>/ month</small></dd></div>
          <div><dt>Required availability</dt><dd>20 h <small>/ week</small></dd></div>
        </dl>
        <div className="compatibility-list">
          <p><b>✓</b> Compensation compatible</p>
          <p><b>✓</b> Availability compatible</p>
        </div>
        <div className="privacy-panel">
          <span>Stayed private</span>
          <p>Exact compensation <b>Private</b></p>
          <p>Exact availability <b>Private</b></p>
        </div>
      </article>

      <aside className="float-card float-card--match">
        <span className="float-icon">✓</span>
        <div><strong>Match</strong><span>Only compatibility is shared</span></div>
      </aside>
    </div>
  );
}
