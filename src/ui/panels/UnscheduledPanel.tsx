import type { Model } from '../../domain/model';
import type { ActivityKind, DayKey } from '../../domain/types';
import { unscheduledGroups } from '../../domain/views';

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

  return (
    <aside className="panel unscheduled">
      <h2>
        Unscheduled <span className="muted">{fixedLeft} left</span>
      </h2>
      {groups.length === 0 && <p className="muted">Everything required is placed.</p>}
      {KIND_ORDER.map((kind) => {
        const ofKind = groups.filter((g) => g.activity.kind === kind);
        if (ofKind.length === 0) return null;
        return (
          <section key={kind}>
            <h3>{KIND_LABELS[kind]}</h3>
            {ofKind.map((g) => (
              <div key={g.activity.id} className={`pool-card kind-${kind}`} title={g.activity.notes || undefined}>
                <span className="card-name">{g.activity.name}</span>
                <span className="card-meta">
                  {g.remaining === null ? 'flexible' : `${g.remaining} left`}
                  {g.activity.weekendCount !== null && g.remaining !== null ? ' (weekend)' : ''} · {g.activity.durationMin}m
                </span>
                {g.activity.tags.length > 0 && (
                  <span className="card-badges">
                    {g.activity.tags.map((tag) => (
                      <span key={tag} className={`badge tag-${tag}`}>
                        {tag}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </aside>
  );
}
