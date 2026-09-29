import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Model } from '../../domain/model';
import type { ActivityKind, DayKey } from '../../domain/types';
import { unscheduledGroups, type UnscheduledGroup } from '../../domain/views';
import { useActiveDrag, type DragData, type DropData } from '../dnd/SchedulerDnd';

const KIND_LABELS: Record<ActivityKind, string> = {
  stage: 'Stage',
  dedicated: 'Dedicated',
  event: 'Events',
  ambient: 'Ambient',
  roaming: 'Roaming',
};
const KIND_ORDER: ActivityKind[] = ['stage', 'dedicated', 'event', 'ambient', 'roaming'];

export function UnscheduledPanel({ model, day }: { model: Model; day: DayKey }) {
  const groups = unscheduledGroups(model, day);
  const fixedLeft = groups.reduce((sum, g) => sum + (g.remaining ?? 0), 0);
  const drop: DropData = { kind: 'unscheduled' };
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled', data: drop });
  const dragging = useActiveDrag();
  const acceptsDrop = dragging?.source === 'board';

  return (
    <aside ref={setNodeRef} className={`panel unscheduled${acceptsDrop ? ' drop-target' : ''}${acceptsDrop && isOver ? ' drop-over' : ''}`}>
      <h2>
        Unscheduled <span className="muted">{fixedLeft} left</span>
      </h2>
      {acceptsDrop && <p className="drop-hint">Drop here to unschedule</p>}
      {groups.length === 0 && <p className="muted">Everything required is placed.</p>}
      {KIND_ORDER.map((kind) => {
        const ofKind = groups.filter((g) => g.activity.kind === kind);
        if (ofKind.length === 0) return null;
        return (
          <section key={kind}>
            <h3>{KIND_LABELS[kind]}</h3>
            {ofKind.map((g) => (
              <PoolCard key={g.activity.id} group={g} />
            ))}
          </section>
        );
      })}
    </aside>
  );
}

function PoolCard({ group }: { group: UnscheduledGroup }) {
  const { activity } = group;
  const drag: DragData = {
    instanceId: group.nextInstanceId,
    activity,
    day: group.day,
    n: group.nextN,
    durationMin: activity.durationMin ?? 0,
    source: 'pool',
    from: null,
  };
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `pool:${activity.id}:${group.day}`, data: drag });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`pool-card kind-${activity.kind}${isDragging ? ' dragging' : ''}`}
      title={activity.notes || undefined}
    >
      <span className="card-name">{activity.name}</span>
      <span className="card-meta">
        {group.remaining === null ? 'flexible' : `${group.remaining} left`}
        {activity.weekendCount !== null && group.remaining !== null ? ' (weekend)' : ''} · {activity.durationMin}m
      </span>
      {activity.tags.length > 0 && (
        <span className="card-badges">
          {activity.tags.map((tag) => (
            <span key={tag} className={`badge tag-${tag}`}>
              {tag}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}
