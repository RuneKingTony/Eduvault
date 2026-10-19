import {
  contract,
  contractChecked,
  type ApiFake,
  type AppContract,
} from '@eduvault/api-contract';
import type { Api } from './api';

/** Holds a hand-written fake API to the real contract: valid requests, answers the client would parse. */
export const checked = (api: Partial<Record<keyof Api, unknown>>): Api =>
  contractChecked(contract, api as ApiFake<AppContract>);
