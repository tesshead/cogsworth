// Drag and drop for the board and the Unscheduled panel (dnd-kit). The drop target is the
// column under the pointer; the start time comes from the dragged card's top edge, snapped
// to the 15-minute grid. Drops are never refused: warnings come from validation.

import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Model } from '../../domain/model';
import { formatClock } from '../../domain/time';
import type { Activity, DayKey } from '../../domain/types';
import { dropStart } from './geometry';

export interface DragData {
  instanceId: string;
  activity: Activity;
  day: DayKey;
  n: number;
  durationMin: number;
  source: 'board' | 'pool';
  /** Current placement, for board drags. */
  from: { locationId: string; start: number } | null;
}

export type DropData = { kind: 'column'; columnKey: string; locationId: string } | { kind: 'unscheduled' };

export type DropTarget = { kind: 'place'; locationId: string; start: number } | { kind: 'unschedule' };

export interface DropPreview {
  columnKey: string;
  start: number;
  durationMin: number;
  setupMin: number;
  breakdownMin: number;
}

const PreviewContext = createContext<DropPreview | null>(null);
const ActiveDragContext = createContext<DragData | null>(null);

export const useDropPreview = () => useContext(PreviewContext);
export const useActiveDrag = () => useContext(ActiveDragContext);

interface Props {
  model: Model;
  day: DayKey;
  onDrop: (drag: DragData, target: DropTarget) => void;
  children: ReactNode;
}

export function SchedulerDnd({ model, day, onDrop, children }: Props) {
  const [active, setActive] = useState<DragData | null>(null);
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const [overUnscheduled, setOverUnscheduled] = useState(false);
  // A small movement threshold keeps plain clicks working for selection.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { open, close } = model.days[day];

  const targetFor = (event: DragMoveEvent | DragEndEvent): { drop: DropData; start: number } | null => {
    const drag = event.active.data.current as DragData | undefined;
    const drop = event.over?.data.current as DropData | undefined;
    const rect = event.active.rect.current.translated;
    if (!drag || !drop || !event.over) return null;
    if (drop.kind === 'unscheduled') return { drop, start: 0 };
    if (!rect) return null;
    const setupMin = drag.source === 'board' ? drag.activity.setupMin : 0;
    return { drop, start: dropStart({ dragTop: rect.top, columnTop: event.over.rect.top, dayOpen: open, dayClose: close, setupMin }) };
  };

  const handleStart = (event: DragStartEvent) => setActive((event.active.data.current as DragData) ?? null);

  const handleMove = (event: DragMoveEvent) => {
    const target = targetFor(event);
    setOverUnscheduled(target?.drop.kind === 'unscheduled');
    if (!active || !target || target.drop.kind !== 'column') {
      if (preview) setPreview(null);
      return;
    }
    const { columnKey } = target.drop;
    if (preview && preview.columnKey === columnKey && preview.start === target.start) return;
    setPreview({
      columnKey,
      start: target.start,
      durationMin: active.durationMin,
      setupMin: active.activity.setupMin,
      breakdownMin: active.activity.breakdownMin,
    });
  };

  const reset = () => {
    setActive(null);
    setPreview(null);
    setOverUnscheduled(false);
  };

  const handleEnd = (event: DragEndEvent) => {
    const drag = event.active.data.current as DragData | undefined;
    const target = targetFor(event);
    reset();
    if (!drag || !target) return;
    if (target.drop.kind === 'unscheduled') {
      if (drag.source === 'board') onDrop(drag, { kind: 'unschedule' });
      return;
    }
    const { locationId } = target.drop;
    if (drag.from && drag.from.locationId === locationId && drag.from.start === target.start) return;
    onDrop(drag, { kind: 'place', locationId, start: target.start });
  };

  const overLabel = (() => {
    if (!active) return '';
    if (overUnscheduled) return active.source === 'board' ? 'Unschedule' : '';
    if (!preview) return '';
    const column = preview.columnKey.startsWith('roaming:') ? 'Roaming' : (model.locations.get(preview.columnKey)?.name ?? '');
    return `${formatClock(preview.start)}–${formatClock(preview.start + preview.durationMin)} · ${column}`;
  })();

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleStart}
      onDragMove={handleMove}
      onDragEnd={handleEnd}
      onDragCancel={reset}
    >
      <ActiveDragContext.Provider value={active}>
        <PreviewContext.Provider value={preview}>{children}</PreviewContext.Provider>
      </ActiveDragContext.Provider>
      <DragOverlay dropAnimation={null}>
        {active && (
          <div className={`drag-ghost kind-${active.activity.kind}`}>
            <span className="card-name">{active.activity.name}</span>
            <span className="card-meta">{overLabel || `${active.durationMin}m`}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
