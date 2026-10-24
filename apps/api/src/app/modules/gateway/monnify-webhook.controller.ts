import {
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import {
  MONNIFY_SIGNATURE_HEADER,
  contract,
  type MonnifyWebhookParams,
  type RouteOutput,
} from '@eduvault/api-contract';
import { zod } from '../../common/http/zod.pipe';
import { MonnifyWebhookService } from './monnify-webhook.service';

const route = contract.webhooks.monnify;

interface RawBodyRequest {
  rawBody?: Buffer;
}

/** Public: Monnify has no session. The school's own signature on the raw body is the credential. */
@Controller('webhooks/monnify')
export class MonnifyWebhookController {
  constructor(private readonly webhook: MonnifyWebhookService) {}

  @Post(':organizationId')
  @HttpCode(200)
  receive(
    @Param(zod(route.params)) params: MonnifyWebhookParams,
    @Headers(MONNIFY_SIGNATURE_HEADER) signature: string | undefined,
    @Req() request: RawBodyRequest
  ): Promise<RouteOutput<typeof route>> {
    return this.webhook.receive({
      organizationId: params.organizationId,
      rawBody: request.rawBody,
      signature,
    });
  }
}
