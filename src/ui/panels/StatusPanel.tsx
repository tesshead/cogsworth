import { useState } from 'react';
import type { Model } from '../../domain/model';
import { formatClock } from '../../domain/time';
import type { DayKey } from '../../domain/types';
import { performerStatuses, type ActivityStatus, type CountState } from '../../validation/status';

const ICON: Record<CountState, string> = { ok: '✓', under: '⚠', over: '↑', flexible: '~', continuous: '↔' };

export function StatusPanel({ model, day }: { model: Model; day: DayKey }) {
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const all = performerStatuses(model).sort((a, b) => a.activities[0]!.activity.name.localeCompare(b.activities[0]!.activity.name));
  const shown = incompleteOnly ? all.filter((p) => p.state === 'under' || p.state === 'over') : all;
  const incomplete = all.filter((p) => p.state === 'under' || p.state === 'over').length;

  return (
    <div>
      <label className="filter">
        <input type="checkbox" checked={incompleteOnly} onChange={(e) => setIncompleteOnly(e.target.checked)} />
        Incomplete only ({incomplete})
      </label>
      <ul className="status-list">
        {shown.map((p) => (
          <li key={p.performerId}>
            {p.activities.length > 1 && <div className="performer-group">{humanize(p.performerId)}</div>}
            {p.activities.map((a) => (
              <StatusRow key={a.activity.id} status={a} model={model} day={day} />
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusRow({ status, model, day }: { status: ActivityStatus; model: Model; day: DayKey }) {
  const { activity, days, weekend, state } = status;
  let counts: string;
  if (state === 'continuous') counts = `roams ${activity.continuousDays.join(', ')}`;
  else if (state === 'flexible') counts = `flexible · Sat ${days.sat.placed} · Sun ${days.sun.placed}`;
  else if (weekend) counts = `${weekend.placed}/${weekend.required} weekend (Sat ${days.sat.placed}, Sun ${days.sun.placed})`;
  else counts = `Sat ${days.sat.placed}/${days.sat.required} · Sun ${days.sun.placed}/${days.sun.required}`;

  const today = days[day];
  const span =
    today.firstStart !== null && today.lastEnd !== null
      ? `${formatClock(today.firstStart)}–${formatClock(today.lastEnd)} · ${today.locationIds.length} ${today.locationIds.length === 1 ? 'location' : 'locations'}`
      : null;

  return (
    <div className={`status-row state-${state}`}>
      <span className="status-icon">{ICON[state]}</span>
      <span className="status-name">{activity.name}</span>
      <span className="status-counts">{counts}</span>
      {span && <span className="status-span muted" title={today.locationIds.map((id) => model.locations.get(id)?.name ?? id).join(', ')}>{span}</span>}
    </div>
  );
}

/** "dame-wisteria" → "Dame Wisteria", for performer group headings. */
function humanize(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
