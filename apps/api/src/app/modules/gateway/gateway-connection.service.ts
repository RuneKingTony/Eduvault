import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  GATEWAY_KEYS_REQUIRED_MESSAGE,
  GATEWAY_SECRET_MASK,
  type GatewayConnection,
  type SaveGatewayConnection,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { ENV_TOKEN, type Env } from '../../common/config/env';
import { GatewaySecrets } from './gateway-secrets';
import {
  GatewayRepository,
  type SealedSecret,
  type StoredConnection,
} from './gateway.repository';
import type { MonnifyCredentials } from './monnify-client';

@Injectable()
export class GatewayConnectionService {
  constructor(
    private readonly gateway: GatewayRepository,
    private readonly secrets: GatewaySecrets,
    @Inject(ENV_TOKEN) private readonly env: Pick<Env, 'BETTER_AUTH_URL'>
  ) {}

  async get(ctx: OrgContext): Promise<GatewayConnection> {
    return this.view(
      ctx.organizationId,
      await this.gateway.findConnection(ctx.organizationId)
    );
  }

  async save(
    ctx: OrgContext,
    input: SaveGatewayConnection
  ): Promise<GatewayConnection> {
    const { organizationId } = ctx;
    const existing = await this.gateway.findConnection(organizationId);
    const keepKeys = existing?.mode === input.mode;
    const apiKey = this.keyFor(organizationId, {
      field: 'api_key',
      given: input.apiKey,
      kept: keepKeys ? existing.apiKey : undefined,
    });
    const secretKey = this.keyFor(organizationId, {
      field: 'secret_key',
      given: input.secretKey,
      kept: keepKeys ? existing.secretKey : undefined,
    });
    const saved = await this.gateway.saveConnection({
      organizationId,
      userId: ctx.user.id,
      mode: input.mode,
      contractCode: input.contractCode,
      apiKey,
      secretKey,
    });
    return this.view(organizationId, saved);
  }

  recordTest(
    organizationId: string,
    result: { ok: boolean; at: Date }
  ): Promise<void> {
    return this.gateway.recordTest(organizationId, result);
  }

  /** The school's keys in the clear, for a call to Monnify; undefined when it has not connected. */
  async credentials(
    organizationId: string
  ): Promise<MonnifyCredentials | undefined> {
    const stored = await this.gateway.findConnection(organizationId);
    return (
      stored && {
        mode: stored.mode,
        contractCode: stored.contractCode,
        apiKey: this.secrets.open(
          { organizationId, field: 'api_key' },
          stored.apiKey
        ),
        secretKey: this.secrets.open(
          { organizationId, field: 'secret_key' },
          stored.secretKey
        ),
      }
    );
  }

  private keyFor(
    organizationId: string,
    key: {
      field: 'api_key' | 'secret_key';
      given: string | undefined;
      kept: SealedSecret | undefined;
    }
  ): SealedSecret {
    if (key.given !== undefined) {
      return this.secrets.seal({ organizationId, field: key.field }, key.given);
    }
    if (key.kept === undefined) {
      throw new BadRequestException(GATEWAY_KEYS_REQUIRED_MESSAGE);
    }
    return key.kept;
  }

  private view(
    organizationId: string,
    stored: StoredConnection | undefined
  ): GatewayConnection {
    const configured = this.env.BETTER_AUTH_URL;
    const base = configured.endsWith('/')
      ? configured.slice(0, -1)
      : configured;
    return {
      webhookUrl: `${base}/webhooks/monnify/${organizationId}`,
      connection:
        stored === undefined
          ? null
          : {
              mode: stored.mode,
              contractCode: stored.contractCode,
              apiKeyMask: `${GATEWAY_SECRET_MASK}${stored.apiKey.tail}`,
              secretKeyMask: `${GATEWAY_SECRET_MASK}${stored.secretKey.tail}`,
              lastTestedAt: stored.lastTestedAt?.toISOString() ?? null,
              lastTestOk: stored.lastTestOk,
              updatedAt: stored.updatedAt.toISOString(),
            },
    };
  }
}
