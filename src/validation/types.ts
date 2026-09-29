import type { Model } from '../domain/model';
import type { DayKey } from '../domain/types';

export type Severity = 'error' | 'warn' | 'info';

export type WarningCode =
  | 'location-overlap'
  | 'performer-overlap'
  | 'outside-parent-event'
  | 'required-location'
  | 'preferred-location'
  | 'missing-capability'
  | 'performer-availability'
  | 'location-hours'
  | 'min-break'
  | 'under-scheduled'
  | 'over-scheduled'
  | 'orphan'
  | 'kind-mismatch';

export interface Warning {
  code: WarningCode;
  severity: Severity;
  day: DayKey | null;
  /** Placed or orphaned instances involved, for highlighting cards. */
  instanceIds: string[];
  activityIds: string[];
  message: string;
}

/** A rule is a pure function of the model. Rules never block anything. */
export type Rule = (model: Model) => Warning[];
