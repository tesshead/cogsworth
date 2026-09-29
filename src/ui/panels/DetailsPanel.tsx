import type { Model } from '../../domain/model';
import { formatClock } from '../../domain/time';
import type { InstanceWarnings } from '../warningIndex';

export function DetailsPanel({ model, instanceId, warnings }: { model: Model; instanceId: string | null; warnings: InstanceWarnings | undefined }) {
  const instance = instanceId ? model.instances.find((i) => i.id === instanceId) : undefined;
  if (!instance) return <p className="muted">Select a card to see its details.</p>;
  const { activity, placement, row } = instance;

  return (
    <div className="details">
      <h3>{activity.name}</h3>
      <dl>
        <dt>When</dt>
        <dd>{placement ? `${instance.day === 'sat' ? 'Saturday' : 'Sunday'} ${formatClock(placement.start)}–${formatClock(placement.end)} (${placement.durationMin}m)` : 'Unscheduled'}</dd>
        <dt>Where</dt>
        <dd>{placement ? (model.locations.get(placement.locationId)?.name ?? placement.locationId) : '—'}</dd>
        {(activity.setupMin > 0 || activity.breakdownMin > 0) && (
          <>
            <dt>Buffers</dt>
            <dd>
              setup {activity.setupMin}m · breakdown {activity.breakdownMin}m
            </dd>
          </>
        )}
        <dt>Status</dt>
        <dd>
          {instance.locked ? 'Locked' : 'Unlocked'}
          {instance.orphan ? ` · orphan (${instance.orphan})` : ''}
        </dd>
        {activity.notes && (
          <>
            <dt>Activity notes</dt>
            <dd>{activity.notes}</dd>
          </>
        )}
        {row?.notes && (
          <>
            <dt>Placement notes</dt>
            <dd>{row.notes}</dd>
          </>
        )}
        {row?.updatedBy && (
          <>
            <dt>Last change</dt>
            <dd>
              {row.updatedBy}
              {row.updatedAt ? ` · ${row.updatedAt}` : ''} · rev {row.rev}
            </dd>
          </>
        )}
      </dl>
      {warnings && warnings.warnings.length > 0 && (
        <ul className="warning-list">
          {warnings.warnings.map((w, i) => (
            <li key={i} className={`warning sev-${w.severity}`}>
              {w.message}
            </li>
          ))}
        </ul>
      )}
      <p className="muted mono">{instance.id}</p>
    </div>
  );
}
