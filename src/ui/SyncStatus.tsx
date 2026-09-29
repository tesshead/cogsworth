interface Props {
  saving: boolean;
  unsavedCount: number;
  saveError: string | null;
  onRetry: () => void;
}

export function SyncStatus({ saving, unsavedCount, saveError, onRetry }: Props) {
  if (saveError) {
    return (
      <span className="sync sync-error" title={saveError}>
        Not saved ({unsavedCount}) — retrying{' '}
        <button type="button" className="link" onClick={onRetry}>
          retry now
        </button>
      </span>
    );
  }
  if (saving || unsavedCount > 0) return <span className="sync sync-saving">Saving {unsavedCount}…</span>;
  return <span className="sync sync-ok">✓ All changes saved</span>;
}
