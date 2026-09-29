// Pure board geometry: which columns to draw, and how overlapping cards share a column.

import { dayCap, placedInstances, type Model, type PlacedInstance, type RoamingBand } from '../../domain/model';
import type { Activity, DayKey, LocationType } from '../../domain/types';

/** 20px per 15-minute slot. */
export const PX_PER_MIN = 20 / 15;

export type SectionKey = LocationType;

export const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'stage', label: 'Stages' },
  { key: 'ambient', label: 'Ambient' },
  { key: 'dedicated', label: 'Dedicated & events' },
  { key: 'roaming', label: 'Roaming' },
];

export interface ColumnDesc {
  key: string;
  section: SectionKey;
  title: string;
  /** Where a drop lands; null when the column can't take drops (no roaming location defined). */
  locationId: string | null;
  /** Minutes the column is open; time outside is shaded. */
  open: number;
  close: number;
  /** Cards laid out in lanes. */
  items: PlacedInstance[];
  /** Event bands drawn behind cards, full width. */
  events: PlacedInstance[];
  /** Continuous-roaming background bands. */
  bands: RoamingBand[];
}

export function buildColumns(model: Model, day: DayKey, visible: ReadonlySet<SectionKey>): ColumnDesc[] {
  const placed = placedInstances(model, day);
  const bounds = model.days[day];
  const columns: ColumnDesc[] = [];

  for (const { key: section } of SECTIONS) {
    if (!visible.has(section)) continue;
    const locations = model.locationOrder.filter((l) => l.type === section);

    if (section !== 'roaming') {
      for (const location of locations) {
        const here = placed.filter((i) => i.placement.locationId === location.id);
        columns.push({
          key: location.id,
          section,
          title: location.name,
          locationId: location.id,
          open: location.hours[day].open ?? bounds.open,
          close: location.hours[day].close ?? bounds.close,
          items: here.filter((i) => i.activity.kind !== 'event'),
          events: here.filter((i) => i.activity.kind === 'event'),
          bands: [],
        });
      }
      continue;
    }

    // Roaming: one lane per activity rather than per location.
    const roamingIds = new Set(locations.map((l) => l.id));
    const atRoaming = placed.filter((i) => roamingIds.has(i.placement.locationId));
    const lanes = new Map<string, Activity>();
    for (const a of model.activities.values()) {
      if (a.active && a.kind === 'roaming' && hasWorkOn(model, a, day)) lanes.set(a.id, a);
    }
    for (const i of atRoaming) lanes.set(i.activity.id, i.activity);
    for (const activity of [...lanes.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      columns.push({
        key: `roaming:${activity.id}`,
        section,
        title: activity.name,
        locationId: locations[0]?.id ?? null,
        open: bounds.open,
        close: bounds.close,
        items: atRoaming.filter((i) => i.activity.id === activity.id),
        events: [],
        bands: model.bands.filter((b) => b.day === day && b.activity.id === activity.id),
      });
    }
  }
  return columns;
}

function hasWorkOn(model: Model, a: Activity, day: DayKey): boolean {
  if (a.continuousDays.length > 0) return a.continuousDays.includes(day);
  if (a.flexibleCount) return true;
  return a.durationMin !== null && dayCap(a, day) > 0 && model.activities.has(a.id);
}

export interface LaneSlot {
  lane: number;
  lanes: number;
}

/**
 * Side-by-side lanes for overlapping items: clusters of transitively overlapping items share
 * a lane count; each item takes the lowest free lane.
 */
export function assignLanes(items: { id: string; start: number; end: number }[]): Map<string, LaneSlot> {
  const out = new Map<string, LaneSlot>();
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    cluster.push({ id: item.id, lane });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return out;
}
