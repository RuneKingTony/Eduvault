import { ConflictException, Injectable } from '@nestjs/common';
import {
  GATEWAY_KEYS_REJECTED_MESSAGE,
  GATEWAY_NOT_CONNECTED_MESSAGE,
  GATEWAY_TEST_OK_MESSAGE,
  GATEWAY_UNAVAILABLE_MESSAGE,
  type GatewayTestResult,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { Clock } from '../../common/clock';
import { GatewayConnectionService } from './gateway-connection.service';
import {
  MonnifyClient,
  MonnifyError,
  type MonnifyCredentials,
} from './monnify-client';

@Injectable()
export class GatewayTestService {
  constructor(
    private readonly connections: GatewayConnectionService,
    private readonly client: MonnifyClient,
    private readonly clock: Clock
  ) {}

  async test(ctx: OrgContext): Promise<GatewayTestResult> {
    const credentials = await this.connections.credentials(ctx.organizationId);
    if (credentials === undefined) {
      throw new ConflictException(GATEWAY_NOT_CONNECTED_MESSAGE);
    }
    const { ok, message } = await this.attempt(credentials);
    const testedAt = new Date(this.clock.now());
    await this.connections.recordTest(ctx.organizationId, { ok, at: testedAt });
    return {
      ok,
      message,
      testedAt: testedAt.toISOString(),
      connection: await this.connections.get(ctx),
    };
  }

  private async attempt(
    credentials: MonnifyCredentials
  ): Promise<{ ok: boolean; message: string }> {
    try {
      await this.client.verifyCredentials(credentials);
      return { ok: true, message: GATEWAY_TEST_OK_MESSAGE };
    } catch (error) {
      if (!(error instanceof MonnifyError)) {
        throw error;
      }
      return {
        ok: false,
        message:
          error.kind === 'rejected'
            ? GATEWAY_KEYS_REJECTED_MESSAGE
            : GATEWAY_UNAVAILABLE_MESSAGE,
      };
    }
  }
}
