import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient;
  }
}

export const dbPlugin = fp<{ databaseUrl: string }>(async (app, opts) => {
  const db = new PrismaClient({ datasourceUrl: opts.databaseUrl });
  await db.$connect();
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await db.$disconnect();
  });
});
