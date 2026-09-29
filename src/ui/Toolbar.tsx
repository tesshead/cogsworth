import { DAYS } from '../config';
import type { DayKey } from '../domain/types';
import { SECTIONS, type SectionKey } from './board/layout';

interface Props {
  day: DayKey;
  onDay: (day: DayKey) => void;
  visibleSections: ReadonlySet<SectionKey>;
  onToggleSection: (key: SectionKey) => void;
  sourceLabel: string;
  onReload: () => void;
  loading: boolean;
}

export function Toolbar({ day, onDay, visibleSections, onToggleSection, sourceLabel, onReload, loading }: Props) {
  return (
    <header className="toolbar">
      <h1>Cogsworth</h1>
      <nav className="day-tabs" aria-label="Day">
        {DAYS.map((d) => (
          <button key={d.key} type="button" className={d.key === day ? 'active' : ''} onClick={() => onDay(d.key)}>
            {d.label} <span className="muted">{d.date.slice(5).replace('-', '/')}</span>
          </button>
        ))}
      </nav>
      <div className="chips" aria-label="Board sections">
        {SECTIONS.filter((s) => s.key !== 'stage').map((s) => (
          <label key={s.key} className={`chip ${visibleSections.has(s.key) ? 'on' : ''}`}>
            <input type="checkbox" checked={visibleSections.has(s.key)} onChange={() => onToggleSection(s.key)} />
            {s.label}
          </label>
        ))}
      </div>
      <div className="toolbar-end">
        <span className="source">{sourceLabel}</span>
        <button type="button" onClick={onReload} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
    </header>
  );
}
