import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  GATEWAY_UNAVAILABLE_MESSAGE,
  GATEWAY_WEBHOOK_REJECTED_MESSAGE,
  MONNIFY_SUCCESS_EVENT,
  monnifyWebhookBodySchema,
  type MonnifyWebhookBody,
  type MonnifyWebhookResult,
} from '@eduvault/api-contract';
import { lagosDateOf } from '@eduvault/shared';
import { GatewayConnectionService } from './gateway-connection.service';
import { GatewayRepository } from './gateway.repository';
import { nairaToMinor } from './monnify-amount';
import {
  MonnifyClient,
  MonnifyError,
  type MonnifyCredentials,
  type MonnifyTransaction,
} from './monnify-client';
import { signatureMatches } from './monnify-signature';

interface MonnifyDelivery {
  organizationId: string;
  rawBody: Buffer | undefined;
  signature: string | undefined;
}

const rejected = (): BadRequestException =>
  new BadRequestException(GATEWAY_WEBHOOK_REJECTED_MESSAGE);

@Injectable()
export class MonnifyWebhookService {
  private readonly logger = new Logger(MonnifyWebhookService.name);

  constructor(
    private readonly gateway: GatewayRepository,
    private readonly connections: GatewayConnectionService,
    private readonly client: MonnifyClient
  ) {}

  async receive(delivery: MonnifyDelivery): Promise<MonnifyWebhookResult> {
    const { organizationId } = delivery;
    const credentials = await this.verified(delivery);
    const body = this.parse(delivery);
    if (body.eventType !== MONNIFY_SUCCESS_EVENT) {
      return { status: 'ignored' };
    }
    const transaction = await this.confirm(credentials, body);
    const account = await this.accountOf(organizationId, transaction);
    const currency = await this.gateway.currency(organizationId);
    const money = this.moneyOf(transaction, body, currency);
    const outcome = await this.gateway.postTopUp({
      organizationId,
      reservedAccountId: account.id,
      walletId: account.walletId,
      reference: transaction.transactionReference,
      paymentReference: transaction.paymentReference,
      ...money,
      paidAt: transaction.paidAt,
      effectiveOn: lagosDateOf(transaction.paidAt),
    });
    if (outcome.status === 'clash') {
      this.logger.error(
        `Monnify transaction ${transaction.transactionReference} clashes with a journal entry of school ${organizationId}`
      );
      throw new ConflictException(GATEWAY_WEBHOOK_REJECTED_MESSAGE);
    }
    return { status: outcome.status === 'posted' ? 'posted' : 'replayed' };
  }

  /** The school must exist and be connected, and the body must carry that school's signature, before anything is read from it. */
  private async verified(
    delivery: MonnifyDelivery
  ): Promise<MonnifyCredentials> {
    const credentials = (await this.gateway.organizationExists(
      delivery.organizationId
    ))
      ? await this.connections.credentials(delivery.organizationId)
      : undefined;
    if (credentials === undefined) {
      throw new NotFoundException(GATEWAY_WEBHOOK_REJECTED_MESSAGE);
    }
    if (delivery.rawBody === undefined) {
      throw rejected();
    }
    if (
      !signatureMatches(
        credentials.secretKey,
        delivery.rawBody,
        delivery.signature
      )
    ) {
      this.logger.warn(
        `Monnify notification for school ${delivery.organizationId} has a bad signature`
      );
      throw new UnauthorizedException(GATEWAY_WEBHOOK_REJECTED_MESSAGE);
    }
    return credentials;
  }

  private parse(delivery: MonnifyDelivery): MonnifyWebhookBody {
    let json: unknown;
    try {
      json = JSON.parse(delivery.rawBody?.toString('utf8') ?? '');
    } catch {
      throw rejected();
    }
    const parsed = monnifyWebhookBodySchema.safeParse(json);
    if (!parsed.success) {
      throw rejected();
    }
    return parsed.data;
  }

  /** Asks Monnify itself about the transaction with this school's keys; the notification is never the source of the money. */
  private async confirm(
    credentials: MonnifyCredentials,
    body: MonnifyWebhookBody
  ): Promise<MonnifyTransaction> {
    const { transactionReference } = body.eventData;
    let transaction: MonnifyTransaction | undefined;
    try {
      transaction = await this.client.getTransaction(
        credentials,
        transactionReference
      );
    } catch (error) {
      if (error instanceof MonnifyError) {
        this.logger.warn(`Could not confirm a transaction: ${error.message}`);
        throw new ServiceUnavailableException(GATEWAY_UNAVAILABLE_MESSAGE);
      }
      throw error;
    }
    if (
      transaction?.transactionReference !== transactionReference ||
      transaction.paymentStatus !== 'PAID'
    ) {
      throw rejected();
    }
    return transaction;
  }

  private async accountOf(
    organizationId: string,
    transaction: MonnifyTransaction
  ) {
    const account =
      transaction.accountReference === null
        ? undefined
        : await this.gateway.findReservedAccountByReference(
            organizationId,
            transaction.accountReference
          );
    if (account === undefined) {
      this.logger.warn(
        `Monnify transaction ${transaction.transactionReference} is not for a reserved account of school ${organizationId}`
      );
      throw rejected();
    }
    return account;
  }

  private moneyOf(
    transaction: MonnifyTransaction,
    body: MonnifyWebhookBody,
    currency: string
  ): { grossMinor: number; feeMinor: number; netMinor: number } {
    const told = nairaToMinor(body.eventData.amountPaid ?? '');
    const grossMinor = transaction.amountPaidMinor;
    const netMinor = transaction.settlementMinor;
    if (
      told !== grossMinor ||
      transaction.currency.toUpperCase() !== currency.toUpperCase() ||
      netMinor <= 0 ||
      netMinor > grossMinor
    ) {
      this.logger.warn(
        `Monnify transaction ${transaction.transactionReference} does not match its notification`
      );
      throw rejected();
    }
    return { grossMinor, feeMinor: grossMinor - netMinor, netMinor };
  }
}
