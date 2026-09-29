import { useCallback, useMemo, useState } from 'react';
import { mockTransport } from '../api/mockTransport';
import type { DayKey } from '../domain/types';
import { useSchedulerData } from '../state/useSchedulerData';
import { Board } from './board/Board';
import type { SectionKey } from './board/layout';
import { SidePanel, type SideTab } from './panels/SidePanel';
import { UnscheduledPanel } from './panels/UnscheduledPanel';
import { Toolbar } from './Toolbar';
import { usePersistentState } from './usePersistentState';
import { indexWarnings } from './warningIndex';
import './app.css';

// Only the mock exists until the Apps Script API lands (M3).
const transport = mockTransport();

export function App() {
  const { state, reload } = useSchedulerData(transport);
  const [day, setDay] = usePersistentState<DayKey>('day', 'sat');
  const [shownOptional, setShownOptional] = usePersistentState<SectionKey[]>('sections', []);
  const [tab, setTab] = usePersistentState<SideTab>('side-tab', 'status');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [markerTime, setMarkerTime] = useState<number | null>(null);

  const visibleSections = useMemo(() => new Set<SectionKey>(['stage', ...shownOptional]), [shownOptional]);
  const toggleSection = (key: SectionKey) =>
    setShownOptional(shownOptional.includes(key) ? shownOptional.filter((k) => k !== key) : [...shownOptional, key]);

  const warnings = state.status === 'ready' ? state.warnings : [];
  const warningIndex = useMemo(() => indexWarnings(warnings), [warnings]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setTab('details');
      // Selecting from a panel should switch to the instance's day.
      if (state.status === 'ready') {
        const inst = state.model.instances.find((i) => i.id === id);
        if (inst) setDay(inst.day);
      }
    },
    [state, setTab, setDay],
  );
  const pickTime = (minute: number) => {
    setMarkerTime(minute);
    setTab('at-time');
  };
  const changeDay = (d: DayKey) => {
    setDay(d);
    setSelectedId(null);
  };

  return (
    <div className="app">
      <Toolbar
        day={day}
        onDay={changeDay}
        visibleSections={visibleSections}
        onToggleSection={toggleSection}
        sourceLabel={transport.label}
        onReload={() => void reload()}
        loading={state.status === 'loading'}
      />
      {state.status === 'loading' && <div className="placeholder">Loading schedule…</div>}
      {state.status === 'error' && (
        <div className="placeholder error">
          Couldn’t load the schedule: {state.message}{' '}
          <button type="button" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <div className="workspace">
          <UnscheduledPanel model={state.model} day={day} />
          <Board
            model={state.model}
            day={day}
            visibleSections={visibleSections}
            warningIndex={warningIndex}
            selectedId={selectedId}
            onSelect={select}
            markerTime={markerTime}
            onPickTime={pickTime}
          />
          <SidePanel
            model={state.model}
            warnings={warnings}
            day={day}
            tab={tab}
            onTab={setTab}
            selectedId={selectedId}
            selectedWarnings={selectedId ? warningIndex.get(selectedId) : undefined}
            onSelect={select}
            markerTime={markerTime}
            onMarkerTime={setMarkerTime}
          />
        </div>
      )}
    </div>
  );
}
