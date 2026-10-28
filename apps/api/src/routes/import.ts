import type { FastifyPluginAsync } from 'fastify';
import {
  headerSignature,
  importBody,
  importMappingQuery,
  importParams,
  type ImportBody,
} from '@fleet-hub/shared';
import { runImport } from '../lib/import';
import { parse } from '../lib/http';
import { requireRole } from '../plugins/auth';

/**
 * Excel import (SPEC 5.9, admins only). The browser reads the sheet and sends its rows; a preview
 * does every write and rolls back, so the dry run shows exactly what the import will do.
 */
export const importRoutes: FastifyPluginAsync<{ codeKey: string }> = async (app, opts) => {
  // A 5,000-row sheet is a few MB of JSON.
  const admin = { preHandler: requireRole('ADMIN'), bodyLimit: 20 * 1024 * 1024 };

  app.get('/mapping', { preHandler: requireRole('ADMIN') }, async (req) => {
    const { target, signature } = parse(importMappingQuery, req.query);
    const saved = await app.db.importMapping.findUnique({
      where: { target_signature: { target, signature } },
      select: { mapping: true },
    });
    return { mapping: (saved?.mapping as ImportBody['mapping'] | undefined) ?? null };
  });

  app.post('/:target/preview', admin, async (req) => {
    const { target } = parse(importParams, req.params);
    const body = parse(importBody, req.body);
    return runImport(app.db, req.user!, target, body, { commit: false, codeKey: opts.codeKey });
  });

  app.post('/:target/commit', admin, async (req) => {
    const { target } = parse(importParams, req.params);
    const body = parse(importBody, req.body);
    const user = req.user!;
    const result = await runImport(app.db, user, target, body, {
      commit: true,
      codeKey: opts.codeKey,
    });
    // The same sheet layout opens with this matching next time.
    const sig = headerSignature(body.headers);
    await app.db.importMapping.upsert({
      where: { target_signature: { target, signature: sig } },
      create: { target, signature: sig, mapping: body.mapping, createdById: user.id },
      update: { mapping: body.mapping },
    });
    return result;
  });
};
