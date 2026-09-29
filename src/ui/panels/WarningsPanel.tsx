import type { DayKey } from '../../domain/types';
import type { Severity, Warning } from '../../validation/types';

const LABELS: Record<Severity, string> = { error: 'Conflicts', warn: 'Warnings', info: 'Notes' };

export function WarningsPanel({ warnings, day, onSelect }: { warnings: Warning[]; day: DayKey; onSelect: (id: string) => void }) {
  const relevant = warnings.filter((w) => w.day === null || w.day === day);
  if (relevant.length === 0) return <p className="muted">No warnings for this day.</p>;

  return (
    <div>
      {(['error', 'warn', 'info'] as const).map((severity) => {
        const list = relevant.filter((w) => w.severity === severity);
        if (list.length === 0) return null;
        return (
          <section key={severity}>
            <h3>
              {LABELS[severity]} <span className="muted">{list.length}</span>
            </h3>
            <ul className="warning-list">
              {list.map((w, i) => (
                <li key={`${w.code}-${i}`} className={`warning sev-${severity}`}>
                  <button type="button" disabled={w.instanceIds.length === 0} onClick={() => w.instanceIds[0] && onSelect(w.instanceIds[0])}>
                    {w.message}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
