import type { FastifyPluginAsync } from 'fastify';
import { DEFAULT_PINNED_VITALS, preferencesBody } from '@fleet-hub/shared';
import { parse } from '../lib/http';
import { requireUser } from '../plugins/auth';

/** The signed-in user's own settings, saved per user so they follow them across devices. */
export const meRoutes: FastifyPluginAsync = async (app) => {
  const read = async (userId: string) => {
    const pref = await app.db.userPreference.findUnique({ where: { userId } });
    return {
      // Never saved yet: the SPEC A6 defaults. An empty saved list means "nothing pinned".
      pinnedVitals: pref ? pref.pinnedVitals : DEFAULT_PINNED_VITALS,
      detailView: pref?.detailView === 'iso' ? 'iso' : 'side',
    };
  };

  app.get('/preferences', { preHandler: requireUser }, async (req) => read(req.user!.id));

  app.put('/preferences', { preHandler: requireUser }, async (req) => {
    const body = parse(preferencesBody, req.body);
    const userId = req.user!.id;
    const current = await read(userId);
    const next = { ...current, ...body };
    await app.db.userPreference.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });
    return next;
  });
};
