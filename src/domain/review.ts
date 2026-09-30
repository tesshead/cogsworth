// "Needs review": where Scheduler_Activities may be out of step with the Acceptances tab.
// Scheduling facts live in Scheduler_Activities; Acceptances is only watched for changes.

import type { Model } from './model';
import type { Acceptance, Activity } from './types';

export type ReviewKind = 'offer-changed' | 'unknown-acceptance' | 'not-scheduled' | 'not-confirmed';

export interface ReviewItem {
  kind: ReviewKind;
  /** Acceptances name (as written there, or as the activity spells it for unknown-acceptance). */
  name: string;
  activities: Activity[];
  acceptance: Acceptance | null;
  message: string;
}

/** Case- and whitespace-insensitive, so "Washing Wenches " matches "washing wenches". */
export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeText(s: string | null): string {
  return (s ?? '').trim().replace(/\s+/g, ' ');
}

export function reviewItems(model: Model): ReviewItem[] {
  if (!model.acceptances) return [];
  const byName = new Map(model.acceptances.map((a) => [normalizeName(a.name), a]));
  const linked = new Map<string, Activity[]>();
  for (const activity of model.activities.values()) {
    if (!activity.acceptance) continue;
    const key = normalizeName(activity.acceptance);
    linked.set(key, [...(linked.get(key) ?? []), activity]);
  }

  const items: ReviewItem[] = [];
  for (const [key, activities] of linked) {
    const acceptance = byName.get(key) ?? null;
    const name = acceptance?.name ?? activities[0]!.acceptance!;
    if (!acceptance) {
      items.push({ kind: 'unknown-acceptance', name, activities, acceptance, message: `No Acceptances row named "${name}"` });
      continue;
    }
    const changed = activities.some(
      (a) => normalizeText(a.reviewedOffer) !== normalizeText(acceptance.offer) || normalizeText(a.reviewedDays) !== normalizeText(acceptance.daysAgreed),
    );
    if (changed) {
      items.push({ kind: 'offer-changed', name, activities, acceptance, message: 'Offer or agreed days changed since last review' });
    }
    if (!acceptance.confirmed && activities.some((a) => a.active)) {
      items.push({ kind: 'not-confirmed', name, activities, acceptance, message: 'Not marked confirmed in Acceptances' });
    }
  }
  for (const acceptance of model.acceptances) {
    if (acceptance.confirmed && !linked.has(normalizeName(acceptance.name))) {
      items.push({ kind: 'not-scheduled', name: acceptance.name, activities: [], acceptance, message: 'Confirmed, but no activity is linked to it' });
    }
  }
  return items;
}
