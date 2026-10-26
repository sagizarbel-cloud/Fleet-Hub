import { loadEnv } from './env';
import { buildApp } from './app';
import { SWEEP_EVERY_MS, sweepStatuses } from './lib/status';

const env = loadEnv();
const app = await buildApp(env);

// Test and insurance dates expire on their own: re-derive every vehicle's status hourly.
const sweep = () =>
  sweepStatuses(app).catch((err: unknown) => app.log.error({ err }, 'status sweep failed'));
const timer = setInterval(sweep, SWEEP_EVERY_MS);
timer.unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: env.API_HOST, port: env.API_PORT });
await sweep();
