import type { Model } from '../../domain/model';
import { formatClock } from '../../domain/time';
import type { InstanceWarnings } from '../warningIndex';
import { Card } from './Card';
import { assignLanes, PX_PER_MIN, type ColumnDesc } from './layout';

const EVENT_STRIP_PX = 18;

interface Props {
  model: Model;
  column: ColumnDesc;
  dayOpen: number;
  dayClose: number;
  warningIndex: Map<string, InstanceWarnings>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  markerTime: number | null;
}

export function Column({ model, column, dayOpen, dayClose, warningIndex, selectedId, onSelect, markerTime }: Props) {
  const y = (min: number) => (min - dayOpen) * PX_PER_MIN;
  // Cards leave a strip on the left so event bands behind them stay visible and labelled.
  const inset = column.events.length > 0 ? EVENT_STRIP_PX : 0;
  const lanes = assignLanes(column.items.map((i) => ({ id: i.id, start: i.placement.occStart, end: i.placement.occEnd })));

  return (
    <div className={`column section-${column.section}`}>
      <div className="column-header" title={column.title}>
        {column.title}
      </div>
      <div className="column-body" style={{ height: y(dayClose) }}>
        {column.open > dayOpen && <div className="closed" style={{ top: 0, height: y(column.open) }} />}
        {column.close < dayClose && <div className="closed" style={{ top: y(column.close), height: y(dayClose) - y(column.close) }} />}

        {column.bands.map((b) => (
          <div
            key={`${b.activity.id}-${b.day}`}
            className="band roaming-band"
            style={{ top: y(b.start), height: (b.end - b.start) * PX_PER_MIN }}
            title={`${b.activity.name} roaming ${formatClock(b.start)}–${formatClock(b.end)}`}
          >
            <span>roaming</span>
          </div>
        ))}

        {column.events.map((e) => {
          const w = warningIndex.get(e.id);
          const classes = ['band', 'event-band'];
          if (w?.worst === 'error') classes.push('sev-error');
          if (selectedId === e.id) classes.push('selected');
          return (
            <button
              type="button"
              key={e.id}
              className={classes.join(' ')}
              style={{ top: y(e.placement.start), height: e.placement.durationMin * PX_PER_MIN }}
              onClick={() => onSelect(e.id)}
              title={`${e.activity.name} ${formatClock(e.placement.start)}–${formatClock(e.placement.end)}`}
            >
              <span className="event-label">
                {e.activity.name}
                {e.locked ? ' · locked' : ''}
              </span>
            </button>
          );
        })}

        {column.items.map((i) => (
          <Card
            key={i.id}
            model={model}
            instance={i}
            columnOpen={dayOpen}
            lane={lanes.get(i.id)!}
            inset={inset}
            warnings={warningIndex.get(i.id)}
            selected={selectedId === i.id}
            onSelect={onSelect}
          />
        ))}

        {markerTime !== null && <div className="time-marker" style={{ top: y(markerTime) }} />}
      </div>
    </div>
  );
}
