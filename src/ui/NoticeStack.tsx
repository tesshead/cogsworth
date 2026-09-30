import type { Model } from '../domain/model';
import type { Notice } from '../state/sync';

interface Props {
  notices: Notice[];
  model: Model | null;
  onDismiss: (seq: number) => void;
  onSelect: (id: string) => void;
}

/** Conflicts and rejected saves stay until dismissed: they mean the board changed under you. */
export function NoticeStack({ notices, model, onDismiss, onSelect }: Props) {
  if (notices.length === 0) return null;
  const nameOf = (id: string) => {
    const inst = model?.instances.find((i) => i.id === id);
    return inst ? `${inst.activity.name} (${inst.day === 'sat' ? 'Sat' : 'Sun'} #${inst.n})` : id;
  };
  return (
    <div className="notices" role="status">
      {notices.map((n) => (
        <div key={n.seq} className={`notice notice-${n.kind}`}>
          <div>
            {n.kind === 'conflict' && n.instanceId && (
              <>
                <button type="button" className="link" onClick={() => onSelect(n.instanceId!)}>
                  {nameOf(n.instanceId)}
                </button>{' '}
                was changed by {n.by}; your change was replaced with theirs.
              </>
            )}
            {n.kind === 'rejected' && n.instanceId && (
              <>
                Couldn’t save {nameOf(n.instanceId)}: {n.message}
              </>
            )}
            {n.kind === 'load-failed' && <>Refresh failed: {n.message}. Showing the last loaded schedule.</>}
            {n.kind === 'review-failed' && <>Couldn’t mark reviewed: {n.message}</>}
          </div>
          <button type="button" className="link" onClick={() => onDismiss(n.seq)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
