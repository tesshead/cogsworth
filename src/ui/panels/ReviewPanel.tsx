import { useState } from 'react';
import type { Model } from '../../domain/model';
import { reviewItems, type ReviewItem } from '../../domain/review';
import type { Activity } from '../../domain/types';

interface Props {
  model: Model;
  onReview: (activityIds: string[]) => Promise<void>;
}

/** Where Scheduler_Activities may be out of step with Acceptances. */
export function ReviewPanel({ model, onReview }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!model.acceptances) return <p className="muted">No Acceptances tab found, so offers aren’t being watched.</p>;
  const items = reviewItems(model);
  if (items.length === 0) return <p className="muted">Scheduler_Activities matches every offer in Acceptances.</p>;

  const markReviewed = async (item: ReviewItem) => {
    setBusy(item.name);
    try {
      await onReview(item.activities.map((a) => a.id));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="review-list">
      {items.map((item) => (
        <li key={`${item.kind}:${item.name}`} className={`review review-${item.kind}`}>
          <div className="review-head">
            <strong>{item.name}</strong>
            <span className="muted">{item.message}</span>
          </div>

          {item.kind === 'offer-changed' && item.acceptance && (
            <>
              <dl className="review-offer">
                <dt>Was</dt>
                <dd>{describeOffer(item.activities[0]!.reviewedOffer, item.activities[0]!.reviewedDays) || <em>never reviewed</em>}</dd>
                <dt>Now</dt>
                <dd>{describeOffer(item.acceptance.offer, item.acceptance.daysAgreed)}</dd>
              </dl>
              <ActivityList activities={item.activities} />
              <p className="muted">Update these rows in Scheduler_Activities if the counts or days changed, then:</p>
              <button type="button" disabled={busy !== null} onClick={() => void markReviewed(item)}>
                {busy === item.name ? 'Saving…' : 'Mark reviewed'}
              </button>
            </>
          )}

          {item.kind === 'not-scheduled' && item.acceptance && (
            <>
              <p>{describeOffer(item.acceptance.offer, item.acceptance.daysAgreed)}</p>
              <p className="muted">
                Add a Scheduler_Activities row with <code>acceptance</code> = “{item.name}”. If it isn’t timed programming (an installation,
                say), add it with <code>active</code> = FALSE so it stops showing here.
              </p>
            </>
          )}

          {item.kind === 'unknown-acceptance' && (
            <>
              <ActivityList activities={item.activities} />
              <p className="muted">Fix the acceptance value on these rows so it matches the name in Acceptances.</p>
            </>
          )}

          {item.kind === 'not-confirmed' && <ActivityList activities={item.activities} />}
        </li>
      ))}
    </ul>
  );
}

function ActivityList({ activities }: { activities: Activity[] }) {
  return (
    <ul className="review-activities">
      {activities.map((a) => (
        <li key={a.id}>
          <span className="mono">{a.id}</span> · {describeCounts(a)}
          {!a.active && ' · inactive'}
        </li>
      ))}
    </ul>
  );
}

function describeOffer(offer: string | null, days: string | null): string {
  return [offer, days].filter(Boolean).join(' · ');
}

function describeCounts(a: Activity): string {
  if (a.continuousDays.length > 0) return `roams ${a.continuousDays.join(', ')}`;
  const duration = a.durationMin !== null ? ` × ${a.durationMin}m` : '';
  if (a.flexibleCount) return `flexible${duration}`;
  if (a.weekendCount !== null) return `${a.weekendCount} over the weekend${duration}`;
  return `Sat ${a.counts.sat ?? 0} · Sun ${a.counts.sun ?? 0}${duration}`;
}
