import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GATEWAY_ACCOUNT_REFUSED_MESSAGE,
  GATEWAY_NOT_CONNECTED_MESSAGE,
  GATEWAY_UNAVAILABLE_MESSAGE,
  WALLET_NOT_FOUND_MESSAGE,
  WALLET_NOT_PAYING_MESSAGE,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { orgScopeOf } from '../../common/scope';
import { GatewayConnectionService } from './gateway-connection.service';
import {
  GatewayRepository,
  type FamilyWallet,
  type StoredReservedAccount,
} from './gateway.repository';
import { MonnifyClient, MonnifyError } from './monnify-client';

/** Deterministic per wallet, so asking Monnify twice can only ever find the same account. */
export const reservedAccountReference = (walletId: string): string =>
  `EDV-W-${walletId}`;

type Provisioned =
  | { status: 'ready'; account: StoredReservedAccount }
  | { status: 'not_connected' };

@Injectable()
export class ReservedAccountService {
  private readonly logger = new Logger(ReservedAccountService.name);

  constructor(
    private readonly gateway: GatewayRepository,
    private readonly connections: GatewayConnectionService,
    private readonly client: MonnifyClient
  ) {}

  async ensureForWallet(ctx: OrgContext, walletId: string): Promise<void> {
    const wallet = await this.gateway.findVisibleWallet(
      orgScopeOf(ctx),
      walletId
    );
    if (wallet === undefined) {
      throw new NotFoundException(WALLET_NOT_FOUND_MESSAGE);
    }
    if (!wallet.paying) {
      throw new BadRequestException(WALLET_NOT_PAYING_MESSAGE);
    }
    try {
      const done = await this.provision(ctx.organizationId, wallet);
      if (done.status === 'not_connected') {
        throw new ConflictException(GATEWAY_NOT_CONNECTED_MESSAGE);
      }
    } catch (error) {
      throw this.refusal(error);
    }
  }

  /** Called after a guardian starts paying fees, once that change has committed; a failure is logged, never raised. */
  async tryEnsureForGuardian(
    organizationId: string,
    guardianId: string
  ): Promise<void> {
    try {
      const wallet = await this.gateway.findWalletOfGuardian(
        organizationId,
        guardianId
      );
      if (wallet?.paying === true) {
        await this.provision(organizationId, wallet);
      }
    } catch (error) {
      this.logger.warn(
        `Reserved account for guardian ${guardianId} was not created: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      );
    }
  }

  private async provision(
    organizationId: string,
    wallet: FamilyWallet
  ): Promise<Provisioned> {
    const existing = await this.gateway.findReservedAccount(
      organizationId,
      wallet.walletId
    );
    if (existing !== undefined) {
      return { status: 'ready', account: existing };
    }
    const credentials = await this.connections.credentials(organizationId);
    if (credentials === undefined) {
      return { status: 'not_connected' };
    }
    const accountReference = reservedAccountReference(wallet.walletId);
    const account =
      (await this.client.findReservedAccount(credentials, accountReference)) ??
      (await this.client.createReservedAccount(credentials, {
        accountReference,
        accountName: wallet.guardianName,
        customerName: wallet.guardianName,
        customerEmail: wallet.guardianEmail,
      }));
    return {
      status: 'ready',
      account: await this.gateway.insertReservedAccount({
        organizationId,
        walletId: wallet.walletId,
        accountReference,
        ...account,
      }),
    };
  }

  private refusal(error: unknown): unknown {
    if (!(error instanceof MonnifyError)) {
      return error;
    }
    this.logger.warn(`Monnify refused the reserved account: ${error.message}`);
    return error.kind === 'unavailable'
      ? new ServiceUnavailableException(GATEWAY_UNAVAILABLE_MESSAGE)
      : new BadGatewayException(GATEWAY_ACCOUNT_REFUSED_MESSAGE);
  }
}
