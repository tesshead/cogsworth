import { useDraggable } from '@dnd-kit/core';
import type { Model, PlacedInstance } from '../../domain/model';
import { formatClock } from '../../domain/time';
import { cardNumber } from '../../domain/views';
import type { DragData } from '../dnd/SchedulerDnd';
import type { InstanceWarnings } from '../warningIndex';
import { PX_PER_MIN, type LaneSlot } from './layout';

interface Props {
  model: Model;
  instance: PlacedInstance;
  columnOpen: number;
  lane: LaneSlot;
  /** Pixels reserved on the left (for event bands). */
  inset: number;
  warnings: InstanceWarnings | undefined;
  selected: boolean;
  unsaved: boolean;
  onSelect: (id: string) => void;
}

const MAX_BADGES = 3;

export function Card({ model, instance, columnOpen, lane, inset, warnings, selected, unsaved, onSelect }: Props) {
  const { activity, placement } = instance;
  const drag: DragData = {
    instanceId: instance.id,
    activity,
    day: instance.day,
    n: instance.n,
    durationMin: placement.durationMin,
    source: 'board',
    from: { locationId: placement.locationId, start: placement.start },
  };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: instance.id, data: drag, disabled: instance.locked });

  const setupPx = activity.setupMin * PX_PER_MIN;
  const breakdownPx = activity.breakdownMin * PX_PER_MIN;
  const bodyPx = placement.durationMin * PX_PER_MIN;
  const { ordinal, of } = cardNumber(model, instance);
  const compact = bodyPx < 34;
  const time = `${formatClock(placement.start)}–${formatClock(placement.end)}`;

  const classes = ['card', `kind-${activity.kind}`];
  if (warnings?.worst === 'error') classes.push('sev-error');
  else if (warnings?.worst === 'warn') classes.push('sev-warn');
  if (instance.orphan) classes.push('orphan');
  if (selected) classes.push('selected');
  if (compact) classes.push('compact');
  if (instance.locked) classes.push('locked');

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role={undefined}
      tabIndex={undefined}
      className={`card-slot${isDragging ? ' dragging' : ''}`}
      style={{
        top: (placement.occStart - columnOpen) * PX_PER_MIN,
        height: setupPx + bodyPx + breakdownPx,
        left: `calc(${inset}px + (100% - ${inset}px) * ${lane.lane / lane.lanes} + 2px)`,
        width: `calc((100% - ${inset}px) / ${lane.lanes} - 4px)`,
      }}
    >
      {setupPx > 0 && <div className="buffer" style={{ height: setupPx }} title={`Setup ${activity.setupMin} min`} />}
      <button
        type="button"
        className={classes.join(' ')}
        style={{ height: bodyPx }}
        onClick={() => onSelect(instance.id)}
        title={`${activity.name} · ${time}${instance.locked ? ' · locked' : ''}${instance.orphan ? ` · orphan (${instance.orphan})` : ''}`}
      >
        {unsaved && <span className="unsaved-dot" title="Saving…" />}
        <span className="card-title">
          <span className="card-name">{activity.name}</span>
          <span className="card-meta">
            {of === null ? `#${ordinal}` : `${ordinal}/${of}`} · {placement.durationMin}m
          </span>
        </span>
        {!compact && (
          <span className="card-badges">
            {instance.locked && <span className="badge lock">locked</span>}
            {activity.tags.slice(0, MAX_BADGES).map((tag) => (
              <span key={tag} className={`badge tag-${tag}`}>
                {tag}
              </span>
            ))}
            {warnings && warnings.count > 0 && <span className="badge warn-count">⚠ {warnings.count}</span>}
          </span>
        )}
        {compact && warnings && warnings.count > 0 && <span className="badge warn-count">⚠ {warnings.count}</span>}
      </button>
      {breakdownPx > 0 && <div className="buffer" style={{ height: breakdownPx }} title={`Breakdown ${activity.breakdownMin} min`} />}
    </div>
  );
}
