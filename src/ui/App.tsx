import { EVENT_NAME } from '../config';

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Cogsworth</h1>
      <p>{EVENT_NAME} programming scheduler.</p>
    </main>
  );
}
