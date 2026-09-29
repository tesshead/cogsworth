import type { Model } from '../../domain/model';
import type { DayKey } from '../../domain/types';
import type { Warning } from '../../validation/types';
import { usePersistentState } from '../usePersistentState';
import type { InstanceWarnings } from '../warningIndex';
import { AtTimePanel } from './AtTimePanel';
import { DetailsPanel } from './DetailsPanel';
import { IssuesPanel } from './IssuesPanel';
import { StatusPanel } from './StatusPanel';
import { WarningsPanel } from './WarningsPanel';

export type SideTab = 'status' | 'warnings' | 'at-time' | 'details' | 'issues';

interface Props {
  model: Model;
  warnings: Warning[];
  day: DayKey;
  tab: SideTab;
  onTab: (tab: SideTab) => void;
  selectedId: string | null;
  selectedWarnings: InstanceWarnings | undefined;
  onSelect: (id: string) => void;
  markerTime: number | null;
  onMarkerTime: (minute: number | null) => void;
}

export function SidePanel(props: Props) {
  const { model, warnings, day, tab, onTab } = props;
  const [collapsed, setCollapsed] = usePersistentState('side-collapsed', false);
  const dayWarnings = warnings.filter((w) => (w.day === null || w.day === day) && w.severity !== 'info');

  const tabs: { key: SideTab; label: string }[] = [
    { key: 'status', label: 'Status' },
    { key: 'warnings', label: `Warnings${dayWarnings.length ? ` (${dayWarnings.length})` : ''}` },
    { key: 'at-time', label: 'At time' },
    { key: 'details', label: 'Details' },
    { key: 'issues', label: `Data${model.issues.length ? ` (${model.issues.length})` : ''}` },
  ];

  if (collapsed) {
    return (
      <aside className="panel side collapsed">
        <button type="button" className="link" onClick={() => setCollapsed(false)} title="Show panel">
          ◂
        </button>
      </aside>
    );
  }

  return (
    <aside className="panel side">
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.key} type="button" className={t.key === tab ? 'active' : ''} onClick={() => onTab(t.key)}>
            {t.label}
          </button>
        ))}
        <button type="button" className="link collapse" onClick={() => setCollapsed(true)} title="Hide panel">
          ▸
        </button>
      </div>
      <div className="tab-body">
        {tab === 'status' && <StatusPanel model={model} day={day} />}
        {tab === 'warnings' && <WarningsPanel warnings={warnings} day={day} onSelect={props.onSelect} />}
        {tab === 'at-time' && (
          <AtTimePanel model={model} day={day} time={props.markerTime} onTimeChange={props.onMarkerTime} onSelect={props.onSelect} />
        )}
        {tab === 'details' && <DetailsPanel model={model} instanceId={props.selectedId} warnings={props.selectedWarnings} />}
        {tab === 'issues' && <IssuesPanel issues={model.issues} />}
      </div>
    </aside>
  );
}
