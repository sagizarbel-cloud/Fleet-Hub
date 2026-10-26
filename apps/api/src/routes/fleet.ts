import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import {
  fleetViewBody,
  fleetViewParams,
  hasRole,
  recordParams,
  recordsQuery,
  type SessionUser,
} from '@fleet-hub/shared';
import { fleetTable } from '../lib/fleet-table';
import { HttpError, parse } from '../lib/http';
import { listRecords } from '../lib/records';
import { requireUser } from '../plugins/auth';

type Tx = Prisma.TransactionClient;

const viewSelect = {
  id: true,
  name: true,
  settings: true,
  createdById: true,
  createdBy: { select: { name: true } },
  updatedAt: true,
} satisfies Prisma.SavedViewSelect;

type ViewRow = Prisma.SavedViewGetPayload<{ select: typeof viewSelect }>;

const canEdit = (user: SessionUser, view: { createdById: string | null }) =>
  view.createdById === user.id || hasRole(user.role, 'ADMIN');

const serializeView = (user: SessionUser, { createdBy, ...view }: ViewRow) => ({
  ...view,
  createdBy: createdBy?.name ?? null,
  canEdit: canEdit(user, view),
});

/** The fleet table (SPEC 5.4): its rows, the shared saved views and the whole-fleet export. */
export const fleetRoutes: FastifyPluginAsync = async (app) => {
  app.get('/table', { preHandler: requireUser }, async () => ({ rows: await fleetTable(app) }));

  /** Every record of one kind across the fleet, for the whole-fleet Excel workbook. */
  app.get('/records/:kind', { preHandler: requireUser }, async (req) => {
    const { kind } = parse(recordParams.pick({ kind: true }), req.params);
    const q = { ...parse(recordsQuery, {}), all: true };
    const vehicles = await app.db.vehicle.findMany({
      orderBy: { serial: 'asc' },
      select: {
        id: true,
        serial: true,
        odometerKm: true,
        engineHours: true,
        type: { select: { usageUnit: true } },
      },
    });
    const items: unknown[] = [];
    for (const { type, ...v } of vehicles) {
      const page = await listRecords(
        app.db as unknown as Tx,
        req.user!,
        kind,
        {
          ...v,
          usageUnit: type.usageUnit,
        },
        q,
      );
      items.push(...page.items.map((row) => ({ serial: v.serial, ...row })));
    }
    return { items };
  });

  app.get('/views', { preHandler: requireUser }, async (req) => {
    const views = await app.db.savedView.findMany({
      select: viewSelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return { items: views.map((v) => serializeView(req.user!, v)) };
  });

  // Anyone, viewers included, may save a view; everyone can then pick it.
  app.post('/views', { preHandler: requireUser }, async (req, reply) => {
    const body = parse(fleetViewBody, req.body);
    const view = await app.db.savedView.create({
      data: { name: body.name, settings: body.settings, createdById: req.user!.id },
      select: viewSelect,
    });
    return reply.status(201).send(serializeView(req.user!, view));
  });

  const editable = async (user: SessionUser, id: string) => {
    const view = await app.db.savedView.findUnique({
      where: { id },
      select: { createdById: true },
    });
    if (!view) throw new HttpError(404, 'not_found');
    if (!canEdit(user, view)) throw new HttpError(403, 'forbidden');
  };

  app.put('/views/:id', { preHandler: requireUser }, async (req) => {
    const { id } = parse(fleetViewParams, req.params);
    const body = parse(fleetViewBody, req.body);
    await editable(req.user!, id);
    const view = await app.db.savedView.update({
      where: { id },
      data: { name: body.name, settings: body.settings },
      select: viewSelect,
    });
    return serializeView(req.user!, view);
  });

  app.delete('/views/:id', { preHandler: requireUser }, async (req, reply) => {
    const { id } = parse(fleetViewParams, req.params);
    await editable(req.user!, id);
    await app.db.$transaction([
      app.db.savedView.delete({ where: { id } }),
      // Anyone who opened the table with it goes back to the built-in view.
      app.db.userPreference.updateMany({ where: { fleetViewId: id }, data: { fleetViewId: null } }),
    ]);
    return reply.status(204).send();
  });
};
