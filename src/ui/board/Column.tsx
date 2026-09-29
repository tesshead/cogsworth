import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Model, PlacedInstance } from '../../domain/model';
import { formatClock } from '../../domain/time';
import { useDropPreview, type DragData, type DropData } from '../dnd/SchedulerDnd';
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
  unsaved: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  markerTime: number | null;
}

export function Column({ model, column, dayOpen, dayClose, warningIndex, unsaved, selectedId, onSelect, markerTime }: Props) {
  const y = (min: number) => (min - dayOpen) * PX_PER_MIN;
  // Cards leave a strip on the left so event bands behind them stay visible and labelled.
  const inset = column.events.length > 0 ? EVENT_STRIP_PX : 0;
  const lanes = assignLanes(column.items.map((i) => ({ id: i.id, start: i.placement.occStart, end: i.placement.occEnd })));

  const dropData: DropData | undefined = column.locationId ? { kind: 'column', columnKey: column.key, locationId: column.locationId } : undefined;
  const { setNodeRef, isOver } = useDroppable({ id: `col:${column.key}`, data: dropData, disabled: !dropData });
  const preview = useDropPreview();
  const ghost = preview?.columnKey === column.key ? preview : null;

  return (
    <div className={`column section-${column.section}`}>
      <div className="column-header" title={column.title}>
        {column.title}
      </div>
      <div ref={setNodeRef} className={`column-body${isOver ? ' drop-over' : ''}`} style={{ height: y(dayClose) }}>
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

        {column.events.map((e) => (
          <EventBand key={e.id} event={e} top={y(e.placement.start)} warnings={warningIndex.get(e.id)} selected={selectedId === e.id} onSelect={onSelect} />
        ))}

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
            unsaved={unsaved.has(i.id)}
            onSelect={onSelect}
          />
        ))}

        {ghost && (
          <div
            className="drop-ghost"
            style={{
              top: y(ghost.start - ghost.setupMin),
              height: (ghost.setupMin + ghost.durationMin + ghost.breakdownMin) * PX_PER_MIN,
            }}
          >
            {formatClock(ghost.start)}
          </div>
        )}

        {markerTime !== null && <div className="time-marker" style={{ top: y(markerTime) }} />}
      </div>
    </div>
  );
}

interface EventProps {
  event: PlacedInstance;
  top: number;
  warnings: InstanceWarnings | undefined;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** Events render as bands behind their child performances. Locked events can't be dragged. */
function EventBand({ event, top, warnings, selected, onSelect }: EventProps) {
  const { activity, placement } = event;
  const drag: DragData = {
    instanceId: event.id,
    activity,
    day: event.day,
    n: event.n,
    durationMin: placement.durationMin,
    source: 'board',
    from: { locationId: placement.locationId, start: placement.start },
  };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: event.id, data: drag, disabled: event.locked });
  const classes = ['band', 'event-band'];
  if (warnings?.worst === 'error') classes.push('sev-error');
  if (selected) classes.push('selected');
  if (isDragging) classes.push('dragging');

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      className={classes.join(' ')}
      style={{ top, height: placement.durationMin * PX_PER_MIN }}
      onClick={() => onSelect(event.id)}
      title={`${activity.name} ${formatClock(placement.start)}–${formatClock(placement.end)}${event.locked ? ' · locked' : ''}`}
    >
      <span className="event-label">
        {activity.name}
        {event.locked ? ' · locked' : ''}
      </span>
    </button>
  );
}
