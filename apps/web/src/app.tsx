import { healthSchema } from '@toasthub/shared';

const health = healthSchema.parse({ status: 'ok' });

export function App() {
  return (
    <main>
      <h1>Toasthub</h1>
      <p>Shared schema status: {health.status}</p>
    </main>
  );
}
