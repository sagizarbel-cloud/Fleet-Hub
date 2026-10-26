import type { FastifyPluginAsync } from 'fastify';
import { parse } from '../lib/http';
import { eventsQuery, listEvents } from '../lib/events';
import { requireUser } from '../plugins/auth';

/** Fleet-wide (or one vehicle's) event log, newest first. Text is built client-side from templates. */
export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireUser }, async (req) =>
    listEvents(app, req.user!, parse(eventsQuery, req.query)),
  );
};
