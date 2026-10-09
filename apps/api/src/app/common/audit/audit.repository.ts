import type { AuditRow } from '@eduvault/api-contract';

export type AuditKind = AuditRow['kind'];
export type AuditAction = NonNullable<AuditRow['action']>;

export interface ActingAuditEntry {
  actorUserId: string;
  organizationId: string;
  method: string;
  path: string;
  status: number;
  reason: string | null;
}

export interface PlatformAuditEntry {
  actorUserId: string;
  organizationId: string | null;
  action: AuditAction;
  path: string;
  status: number;
}

export interface AuditKey {
  createdAt: string;
  id: string;
}

export interface AuditFilter {
  schoolId?: string;
  writesOnly: boolean;
  kind?: AuditKind;
  after?: AuditKey;
  limit: number;
}

export interface AuditPage {
  items: AuditRow[];
  next: AuditKey | undefined;
}

export abstract class AuditRepository {
  abstract recordActing(entry: ActingAuditEntry): Promise<void>;

  abstract recordPlatform(entry: PlatformAuditEntry): Promise<void>;

  abstract list(filter: AuditFilter): Promise<AuditPage>;

  abstract countActing(): Promise<number>;
}
