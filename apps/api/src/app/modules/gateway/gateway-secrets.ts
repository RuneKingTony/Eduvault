import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GATEWAY_ENCRYPTION_OFF_MESSAGE } from '@eduvault/api-contract';
import { open, seal } from '../../common/crypto';
import { ENV_TOKEN, type Env } from '../../common/config/env';
import type { SealedSecret } from './gateway.repository';

type SecretField = 'api_key' | 'secret_key';

const MAX_TAIL = 4;

const contextOf = (secret: {
  organizationId: string;
  field: SecretField;
}): string => `${secret.organizationId}:${secret.field}`;

/** The tail shown back to the owner; short keys show less so the mask never gives most of one away. */
export const tailOf = (secret: string): string =>
  secret.slice(-Math.max(1, Math.min(MAX_TAIL, Math.floor(secret.length / 4))));

@Injectable()
export class GatewaySecrets {
  private readonly key: Buffer | undefined;

  constructor(@Inject(ENV_TOKEN) env: Pick<Env, 'GATEWAY_ENCRYPTION_KEY'>) {
    this.key =
      env.GATEWAY_ENCRYPTION_KEY === undefined
        ? undefined
        : Buffer.from(env.GATEWAY_ENCRYPTION_KEY, 'base64');
  }

  seal(
    secret: { organizationId: string; field: SecretField },
    plaintext: string
  ): SealedSecret {
    return {
      enc: seal(this.keyOrThrow(), {
        plaintext,
        context: contextOf(secret),
      }),
      tail: tailOf(plaintext),
    };
  }

  open(
    secret: { organizationId: string; field: SecretField },
    sealed: SealedSecret
  ): string {
    return open(this.keyOrThrow(), {
      value: sealed.enc,
      context: contextOf(secret),
    });
  }

  private keyOrThrow(): Buffer {
    if (this.key === undefined) {
      throw new ServiceUnavailableException(GATEWAY_ENCRYPTION_OFF_MESSAGE);
    }
    return this.key;
  }
}
