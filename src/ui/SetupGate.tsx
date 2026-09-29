import { useState, type FormEvent } from 'react';

interface Props {
  needsKey: boolean;
  initialName: string;
  keyRejected: boolean;
  onSubmit: (name: string, key: string | null) => void;
}

/** Asks once for the editor's name (recorded on each change) and, for the real API, the shared edit key. */
export function SetupGate({ needsKey, initialName, keyRejected, onSubmit }: Props) {
  const [name, setName] = useState(initialName);
  const [key, setKey] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || (needsKey && !key.trim())) return;
    onSubmit(name, needsKey ? key : null);
  };
  return (
    <div className="gate-backdrop">
      <form className="gate" onSubmit={submit}>
        <h2>Cogsworth</h2>
        <label>
          Your name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Shown on changes you make" />
        </label>
        {needsKey && (
          <label>
            Edit key
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="current-password" />
          </label>
        )}
        {keyRejected && <p className="gate-error">That key was rejected. Ask the organizer for the current one.</p>}
        <p className="muted">Stored in this browser only.</p>
        <button type="submit" disabled={!name.trim() || (needsKey && !key.trim())}>
          Continue
        </button>
      </form>
    </div>
  );
}
