import type { DataIssue } from '../../domain/types';

const TAB_NAMES = { activities: 'Scheduler_Activities', locations: 'Scheduler_Locations', schedule: 'Scheduler_Schedule' } as const;

export function IssuesPanel({ issues }: { issues: DataIssue[] }) {
  if (issues.length === 0) return <p className="muted">The Sheet data parsed cleanly.</p>;
  return (
    <ul className="issue-list">
      {issues.map((issue, i) => (
        <li key={i}>
          <span className="muted">
            {TAB_NAMES[issue.tab]} · {issue.row}
            {issue.field ? ` · ${issue.field}` : ''}
          </span>
          <div>{issue.message}</div>
        </li>
      ))}
    </ul>
  );
}
