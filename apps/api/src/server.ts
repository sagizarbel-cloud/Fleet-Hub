import { loadEnv } from './env';
import { buildApp } from './app';

const env = loadEnv();
const app = await buildApp(env);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: env.API_HOST, port: env.API_PORT });
