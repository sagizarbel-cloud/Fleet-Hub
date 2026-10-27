import { Prisma } from '@prisma/client';
import {
  FUEL_RECEIPT_CATEGORIES,
  hasRole,
  RECORD_KINDS,
  type ReceiptState,
  type RecordKind,
  type SessionUser,
} from '@fleet-hub/shared';
import { HttpError } from './http';
import { attachmentsFor, KINDS } from './records';

type Tx = Prisma.TransactionClient;

/** Editors and admins change any receipt; a viewer only their own suggested one. */
export function canChangeReceipt(
  user: SessionUser,
  doc: { createdById: string | null; approvedAt: Date | null },
) {
  return hasRole(user.role, 'EDITOR') || (doc.createdById === user.id && !doc.approvedAt);
}

export const receiptSelect = {
  id: true,
  kind: true,
  date: true,
  vendor: true,
  amount: true,
  notes: true,
  linkedRecordType: true,
  linkedRecordId: true,
  createdById: true,
  approvedAt: true,
  deletedAt: true,
  createdAt: true,
  category: { select: { code: true } },
  createdBy: { select: { name: true } },
  vehicles: {
    select: { vehicle: { select: { serial: true, type: { select: { code: true } } } } },
    orderBy: { vehicle: { serial: 'asc' } },
  },
} satisfies Prisma.DocumentSelect;
export type ReceiptRow = Prisma.DocumentGetPayload<{ select: typeof receiptSelect }>;

const KIND_OF_SOURCE = new Map(RECORD_KINDS.map((k) => [KINDS[k].sourceType, k]));

export function receiptState(row: { approvedAt: Date | null }): ReceiptState {
  return row.approvedAt ? 'approved' : 'suggested';
}

/** Receipts as the API returns them, with their files and what the user may do. */
export async function serializeReceipts(tx: Tx, user: SessionUser, rows: ReceiptRow[]) {
  const files = await attachmentsFor(
    tx,
    'Document',
    rows.map((r) => r.id),
  );
  return rows.map(
    ({
      amount,
      category,
      createdBy,
      vehicles,
      linkedRecordType,
      linkedRecordId,
      deletedAt: _d,
      ...r
    }) => {
      const linkedKind = linkedRecordType ? KIND_OF_SOURCE.get(linkedRecordType) : undefined;
      return {
        ...r,
        amount: amount?.toNumber() ?? null,
        category: category?.code ?? null,
        createdBy: createdBy?.name ?? null,
        state: receiptState(r),
        linked: linkedKind && linkedRecordId ? { kind: linkedKind, id: linkedRecordId } : null,
        vehicles: vehicles.map((v) => ({ serial: v.vehicle.serial, type: v.vehicle.type.code })),
        canEdit: canChangeReceipt(user, r),
        attachments: files.get(r.id) ?? [],
      };
    },
  );
}

/** Checks the linked record exists, isn't deleted and belongs to one of the tagged vehicles. */
export async function checkLinked(
  tx: Tx,
  linked: { kind: RecordKind; id: string } | null,
  vehicleIds: string[],
) {
  if (!linked) return { linkedRecordType: null, linkedRecordId: null };
  const model = (tx as unknown as Record<string, { findFirst(a: object): Promise<unknown> }>)[
    KINDS[linked.kind].model
  ]!;
  const row = await model.findFirst({
    where: { id: linked.id, vehicleId: { in: vehicleIds }, deletedAt: null },
    select: { id: true },
  });
  if (!row) {
    const err = new HttpError(400, 'validation_failed');
    Object.assign(err, { issues: [{ path: 'linked', code: 'unknown' }] });
    throw err;
  }
  return { linkedRecordType: KINDS[linked.kind].sourceType, linkedRecordId: linked.id };
}

export interface ReceiptCost {
  fuel: number;
  maintenance: number;
}

/**
 * What approved receipts add to each vehicle's costs since a date (Sagi, 2026-10-27). A receipt
 * linked to a record adds nothing (that record's cost already counts); an unlinked one counts
 * as fuel or maintenance by its category. A receipt tagged to several vehicles is split evenly.
 */
export async function receiptCosts(
  db: Tx,
  since: Date,
  vehicleId?: string,
): Promise<Map<string, ReceiptCost>> {
  const rows = await db.document.findMany({
    where: {
      deletedAt: null,
      approvedAt: { not: null },
      linkedRecordId: null,
      amount: { not: null },
      date: { gte: since },
      ...(vehicleId ? { vehicles: { some: { vehicleId } } } : {}),
    },
    select: {
      amount: true,
      category: { select: { code: true } },
      vehicles: { select: { vehicleId: true } },
    },
  });
  const fuelCodes: readonly string[] = FUEL_RECEIPT_CATEGORIES;
  const out = new Map<string, ReceiptCost>();
  for (const r of rows) {
    if (!r.vehicles.length) continue;
    const share = r.amount!.toNumber() / r.vehicles.length;
    const key = r.category && fuelCodes.includes(r.category.code) ? 'fuel' : 'maintenance';
    for (const { vehicleId: v } of r.vehicles) {
      const cost = out.get(v) ?? { fuel: 0, maintenance: 0 };
      cost[key] += share;
      out.set(v, cost);
    }
  }
  return out;
}
