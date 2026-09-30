import { useCallback, useMemo, useState } from 'react';
import { credentials } from '../api/credentials';
import { fetchTransport } from '../api/fetchTransport';
import { mockTransport } from '../api/mockTransport';
import type { Transport } from '../api/transport';
import { formatTime } from '../domain/time';
import type { DayKey } from '../domain/types';
import { useScheduleStore } from '../state/useScheduleStore';
import { Board } from './board/Board';
import type { SectionKey } from './board/layout';
import { SchedulerDnd, type DragData, type DropTarget } from './dnd/SchedulerDnd';
import { NoticeStack } from './NoticeStack';
import { SidePanel, type SideTab } from './panels/SidePanel';
import { UnscheduledPanel } from './panels/UnscheduledPanel';
import { SetupGate } from './SetupGate';
import { SyncStatus } from './SyncStatus';
import { Toolbar } from './Toolbar';
import { usePersistentState } from './usePersistentState';
import { indexWarnings } from './warningIndex';
import './app.css';

// VITE_API_URL points at the Apps Script deployment. Without it, the app runs on invented
// mock data; ?mockFailRate=0.3 makes 30% of mock saves fail, to try out retries.
const API_URL: string | undefined = import.meta.env.VITE_API_URL;
const params = new URLSearchParams(window.location.search);
// ?mock forces mock data in development, e.g. to try things without touching the real Sheet.
const useMock = !API_URL || (import.meta.env.DEV && params.has('mock'));
const mock = !useMock ? null : mockTransport({ failRate: Number(params.get('mockFailRate') ?? 0) });
const transport: Transport = mock ?? fetchTransport(API_URL!, credentials.key);
if (import.meta.env.DEV && mock) {
  // For trying out conflicts from the console: cogsworthMock.externalEdit('id', { start_time: '15:00' })
  (window as unknown as { cogsworthMock: unknown }).cogsworthMock = mock.server;
}

export function App() {
  const [editorName, setEditorName] = useState(credentials.name);
  const [keyRejected, setKeyRejected] = useState(false);
  const needsKey = !mock && (keyRejected || !credentials.key());
  const [, setNoKey] = useState(false);
  const onUnauthorized = useCallback(() => {
    // Only say "rejected" if a key was actually tried; a first visit just has none yet.
    const hadKey = credentials.key() !== '';
    credentials.setKey('');
    if (hadKey) setKeyRejected(true);
    else setNoKey(true);
  }, []);
  const store = useScheduleStore(transport, editorName || 'unknown', onUnauthorized);
  const { view } = store;
  const [day, setDay] = usePersistentState<DayKey>('day', 'sat');
  const [shownOptional, setShownOptional] = usePersistentState<SectionKey[]>('sections', []);
  const [tab, setTab] = usePersistentState<SideTab>('side-tab', 'status');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [markerTime, setMarkerTime] = useState<number | null>(null);

  const visibleSections = useMemo(() => new Set<SectionKey>(['stage', ...shownOptional]), [shownOptional]);
  const toggleSection = (key: SectionKey) =>
    setShownOptional(shownOptional.includes(key) ? shownOptional.filter((k) => k !== key) : [...shownOptional, key]);

  const warnings = view?.warnings ?? [];
  const warningIndex = useMemo(() => indexWarnings(warnings), [warnings]);

  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      setTab('details');
      // Selecting from a panel should switch to the instance's day.
      const inst = view?.model.instances.find((i) => i.id === id);
      if (inst) setDay(inst.day);
    },
    [view, setTab, setDay],
  );
  const pickTime = (minute: number) => {
    setMarkerTime(minute);
    setTab('at-time');
  };
  const changeDay = (d: DayKey) => {
    setDay(d);
    setSelectedId(null);
  };

  const finishSetup = (name: string, key: string | null) => {
    credentials.setName(name);
    setEditorName(name.trim());
    if (key !== null) {
      credentials.setKey(key);
      setKeyRejected(false);
      void store.reload();
      store.retryNow();
    }
  };

  const { edit } = store;
  const handleDrop = useCallback(
    (drag: DragData, target: DropTarget) => {
      const set =
        target.kind === 'place'
          ? { location_id: target.locationId, start_time: formatTime(target.start) }
          : { location_id: null, start_time: null };
      edit({ id: drag.instanceId, activityId: drag.activity.id, day: drag.day, n: drag.n, set });
      if (target.kind === 'place') setSelectedId(drag.instanceId);
      else if (selectedId === drag.instanceId) setSelectedId(null);
    },
    [edit, selectedId],
  );

  return (
    <div className="app">
      <Toolbar
        day={day}
        onDay={changeDay}
        visibleSections={visibleSections}
        onToggleSection={toggleSection}
        sourceLabel={transport.label}
        onReload={() => void store.reload()}
        status={<SyncStatus saving={store.saving} unsavedCount={store.unsavedCount} saveError={store.saveError} onRetry={store.retryNow} />}
      />
      {(!editorName || needsKey) && (
        <SetupGate needsKey={needsKey} initialName={editorName} keyRejected={keyRejected} onSubmit={finishSetup} />
      )}
      {!view && !store.loadError && <div className="placeholder">Loading schedule…</div>}
      {!view && store.loadError && !needsKey && (
        <div className="placeholder error">
          Couldn’t load the schedule: {store.loadError}{' '}
          <button type="button" onClick={() => void store.reload()}>
            Try again
          </button>
        </div>
      )}
      {view && (
        <SchedulerDnd model={view.model} day={day} onDrop={handleDrop}>
          <div className="workspace">
            <UnscheduledPanel model={view.model} day={day} />
            <Board
              model={view.model}
              day={day}
              visibleSections={visibleSections}
              warningIndex={warningIndex}
              unsaved={view.unsaved}
              selectedId={selectedId}
              onSelect={select}
              markerTime={markerTime}
              onPickTime={pickTime}
            />
            <SidePanel
              model={view.model}
              warnings={warnings}
              day={day}
              tab={tab}
              onTab={setTab}
              selectedId={selectedId}
              selectedWarnings={selectedId ? warningIndex.get(selectedId) : undefined}
              onSelect={select}
              markerTime={markerTime}
              onMarkerTime={setMarkerTime}
              onReview={store.review}
            />
          </div>
        </SchedulerDnd>
      )}
      <NoticeStack notices={store.notices} model={view?.model ?? null} onDismiss={store.dismissNotice} onSelect={select} />
    </div>
  );
}
