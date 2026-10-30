import { PgBoss } from 'pg-boss';

import { parseEnv } from '../config/env';
import { isJobName, JobName } from './job-names';

// Queues one job now, for the running worker to pick up: `bun run --filter @toasthub/api job <name>`.
async function main(): Promise<void> {
  const name = process.argv[2] ?? '';
  if (!isJobName(name)) {
    console.error(`Usage: job <name>, one of: ${Object.values(JobName).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const boss = new PgBoss({
    connectionString: parseEnv(process.env).DATABASE_URL,
    // Only sends: the worker does the maintenance and the schedules.
    supervise: false,
    schedule: false,
  });
  await boss.start();
  try {
    // The worker creates the queues with their retry settings on its first start.
    if (!(await boss.getQueue(name))) {
      throw new Error(`Queue ${name} doesn't exist yet: start the worker once first`);
    }
    const id = await boss.send(name);
    console.log(`Queued ${name} (${id ?? 'not created'}). The worker runs it within seconds.`);
  } finally {
    await boss.stop({ graceful: false });
  }
}

void main();
