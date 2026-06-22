import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SessionUser } from '@loan-pilot/domain';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface AuditEntry {
  id: string;
  actorName: string;
  action: string;
  changes: AuditChange[];
  createdAt: string;
}

interface RecordInput {
  entity: 'borrower' | 'loan';
  entityId: string;
  action: string;
  changes: AuditChange[];
}

const normalize = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

/** Read a stored JSON `changes` blob back into typed AuditChange[]. */
const toChanges = (value: Prisma.JsonValue): AuditChange[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) =>
    entry && typeof entry === 'object' && !Array.isArray(entry) && 'field' in entry
      ? [{ field: String(entry.field), from: normalize(entry.from), to: normalize(entry.to) }]
      : [],
  );
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Field-by-field diff of changed values only (skips unchanged / no-ops). */
  diff(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): AuditChange[] {
    const changes: AuditChange[] = [];
    for (const field of fields) {
      const from = normalize(before[field]);
      const to = normalize(after[field]);
      if (from !== to) changes.push({ field, from, to });
    }
    return changes;
  }

  /** Append an audit event. No-op when there are no changes. Honours a tx client. */
  async record(
    tenantId: string,
    actor: SessionUser,
    input: RecordInput,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (input.changes.length === 0) return;
    await client.auditEvent.create({
      data: {
        tenantId,
        actorId: actor.id,
        actorName: actor.name,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        // Round-trip to a plain JSON value for the Prisma Json column.
        changes: JSON.parse(JSON.stringify(input.changes)),
      },
    });
  }

  async listFor(
    tenantId: string,
    entity: 'borrower' | 'loan',
    entityId: string,
    limit = 20,
  ): Promise<AuditEntry[]> {
    const events = await this.prisma.auditEvent.findMany({
      where: { tenantId, entity, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return events.map((event) => ({
      id: event.id,
      actorName: event.actorName,
      action: event.action,
      changes: toChanges(event.changes),
      createdAt: event.createdAt.toISOString(),
    }));
  }
}
