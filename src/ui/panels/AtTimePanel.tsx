import type { Model } from '../../domain/model';
import { formatClock, formatTime, parseTime } from '../../domain/time';
import type { DayKey } from '../../domain/types';
import { happeningAt } from '../../domain/views';

interface Props {
  model: Model;
  day: DayKey;
  time: number | null;
  onTimeChange: (minute: number | null) => void;
  onSelect: (id: string) => void;
}

export function AtTimePanel({ model, day, time, onTimeChange, onSelect }: Props) {
  const { open, close } = model.days[day];
  const now = happeningAt(model, day, time ?? open);

  return (
    <div>
      <label className="filter">
        At{' '}
        <input
          type="time"
          step={900}
          min={formatTime(open)}
          max={formatTime(close)}
          value={formatTime(time ?? open)}
          onChange={(e) => onTimeChange(parseTime(e.target.value))}
        />
        {time !== null && (
          <button type="button" className="link" onClick={() => onTimeChange(null)}>
            clear marker
          </button>
        )}
      </label>
      <p className="muted">Or click a time on the board’s time axis.</p>

      <h3>
        Performances & events <span className="muted">{now.instances.length}</span>
      </h3>
      {now.instances.length === 0 && <p className="muted">Nothing scheduled.</p>}
      <ul className="at-list">
        {now.instances.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onSelect(i.id)}>
              <strong>{i.activity.name}</strong> · {model.locations.get(i.placement.locationId)?.name} ·{' '}
              {formatClock(i.placement.start)}–{formatClock(i.placement.end)}
            </button>
          </li>
        ))}
      </ul>

      <h3>
        Roaming <span className="muted">{now.roaming.length}</span>
      </h3>
      {now.roaming.length === 0 && <p className="muted">No continuous roamers.</p>}
      <ul className="at-list">
        {now.roaming.map((b) => (
          <li key={b.activity.id}>{b.activity.name}</li>
        ))}
      </ul>
    </div>
  );
}
