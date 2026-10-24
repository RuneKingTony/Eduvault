import { randomUUID } from 'node:crypto';
import { canSeeCampus } from '../../common/campus-scope';
import type { OrgScope } from '../../common/scope';
import {
  GatewayRepository,
  type FamilyWallet,
  type GatewayTopUpOutcome,
  type NewConnection,
  type NewGatewayTopUp,
  type NewReservedAccountRow,
  type StoredConnection,
  type StoredReservedAccount,
} from './gateway.repository';

interface FakeFamily extends FamilyWallet {
  organizationId: string;
  campusIds: string[];
}

/** In-memory stand-in that keeps the rules the database holds: one connection and one account per school, a reference posts once. */
export class FakeGatewayRepository extends GatewayRepository {
  readonly organizations = new Set<string>();
  readonly connections = new Map<string, StoredConnection>();
  readonly families: FakeFamily[] = [];
  readonly accounts: (StoredReservedAccount & { organizationId: string })[] =
    [];
  readonly posted: (NewGatewayTopUp & { id: string })[] = [];
  readonly foreignReferences = new Set<string>();
  readonly savedBy: string[] = [];

  organizationExists(organizationId: string): Promise<boolean> {
    return Promise.resolve(this.organizations.has(organizationId));
  }

  currency(): Promise<string> {
    return Promise.resolve('NGN');
  }

  findConnection(
    organizationId: string
  ): Promise<StoredConnection | undefined> {
    return Promise.resolve(this.connections.get(organizationId));
  }

  saveConnection(input: NewConnection): Promise<StoredConnection> {
    const saved: StoredConnection = {
      mode: input.mode,
      contractCode: input.contractCode,
      apiKey: input.apiKey,
      secretKey: input.secretKey,
      lastTestedAt: null,
      lastTestOk: null,
      updatedAt: new Date('2026-10-24T10:00:00Z'),
    };
    this.connections.set(input.organizationId, saved);
    this.savedBy.push(input.userId);
    return Promise.resolve(saved);
  }

  recordTest(
    organizationId: string,
    result: { ok: boolean; at: Date }
  ): Promise<void> {
    const found = this.connections.get(organizationId);
    if (found !== undefined) {
      this.connections.set(organizationId, {
        ...found,
        lastTestedAt: result.at,
        lastTestOk: result.ok,
      });
    }
    return Promise.resolve();
  }

  findVisibleWallet(
    scope: OrgScope,
    walletId: string
  ): Promise<FamilyWallet | undefined> {
    const family = this.families.find(
      (row) =>
        row.organizationId === scope.organizationId &&
        row.walletId === walletId &&
        (scope.campusScope === 'all' ||
          row.campusIds.some((campusId) =>
            canSeeCampus(scope.campusScope, campusId)
          ))
    );
    return Promise.resolve(family);
  }

  findWalletOfGuardian(
    organizationId: string,
    guardianId: string
  ): Promise<FamilyWallet | undefined> {
    return Promise.resolve(
      this.families.find(
        (row) =>
          row.organizationId === organizationId && row.guardianId === guardianId
      )
    );
  }

  findReservedAccount(
    organizationId: string,
    walletId: string
  ): Promise<StoredReservedAccount | undefined> {
    return Promise.resolve(
      this.accounts.find(
        (row) =>
          row.organizationId === organizationId && row.walletId === walletId
      )
    );
  }

  findReservedAccountByReference(
    organizationId: string,
    accountReference: string
  ): Promise<StoredReservedAccount | undefined> {
    return Promise.resolve(
      this.accounts.find(
        (row) =>
          row.organizationId === organizationId &&
          row.accountReference === accountReference
      )
    );
  }

  async insertReservedAccount(
    input: NewReservedAccountRow
  ): Promise<StoredReservedAccount> {
    const kept = await this.findReservedAccount(
      input.organizationId,
      input.walletId
    );
    if (kept !== undefined) {
      return kept;
    }
    const row = { id: randomUUID(), ...input };
    this.accounts.push(row);
    return row;
  }

  postTopUp(input: NewGatewayTopUp): Promise<GatewayTopUpOutcome> {
    const key = `${input.organizationId}:${input.reference}`;
    if (this.foreignReferences.has(key)) {
      return Promise.resolve({ status: 'clash' });
    }
    if (
      this.posted.some(
        (row) =>
          row.organizationId === input.organizationId &&
          row.reference === input.reference
      )
    ) {
      return Promise.resolve({ status: 'replayed' });
    }
    const id = randomUUID();
    this.posted.push({ id, ...input });
    return Promise.resolve({ status: 'posted', id });
  }
}
