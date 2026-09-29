import { SLOT_MIN } from '../../config';
import type { Model } from '../../domain/model';
import { formatClock } from '../../domain/time';
import type { DayKey } from '../../domain/types';
import type { InstanceWarnings } from '../warningIndex';
import { Column } from './Column';
import { buildColumns, PX_PER_MIN, SECTIONS, type SectionKey } from './layout';

interface Props {
  model: Model;
  day: DayKey;
  visibleSections: ReadonlySet<SectionKey>;
  warningIndex: Map<string, InstanceWarnings>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  markerTime: number | null;
  onPickTime: (minute: number) => void;
}

export function Board({ model, day, visibleSections, warningIndex, selectedId, onSelect, markerTime, onPickTime }: Props) {
  const { open, close } = model.days[day];
  const columns = buildColumns(model, day, visibleSections);
  const slots: number[] = [];
  for (let t = open; t < close; t += SLOT_MIN) slots.push(t);

  return (
    <div className="board-scroll">
      <div className="board" style={{ ['--slot-px' as string]: `${SLOT_MIN * PX_PER_MIN}px` }}>
        <div className="gutter">
          <div className="gutter-header" />
          <div className="gutter-body" style={{ height: (close - open) * PX_PER_MIN }}>
            {slots.map((t) => (
              <button
                type="button"
                key={t}
                className={`gutter-slot ${t % 60 === 0 ? 'hour' : ''}`}
                style={{ top: (t - open) * PX_PER_MIN }}
                onClick={() => onPickTime(t)}
                title={`What's happening at ${formatClock(t)}?`}
              >
                {t % 60 === 0 ? formatClock(t).replace(':00', '') : `:${String(t % 60).padStart(2, '0')}`}
              </button>
            ))}
          </div>
        </div>

        {SECTIONS.filter((s) => visibleSections.has(s.key)).map((section) => {
          const cols = columns.filter((c) => c.section === section.key);
          if (cols.length === 0) return null;
          return (
            <div key={section.key} className="section">
              <div className="section-title">{section.label}</div>
              <div className="section-columns">
                {cols.map((column) => (
                  <Column
                    key={column.key}
                    model={model}
                    column={column}
                    dayOpen={open}
                    dayClose={close}
                    warningIndex={warningIndex}
                    selectedId={selectedId}
                    onSelect={onSelect}
                    markerTime={markerTime}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
