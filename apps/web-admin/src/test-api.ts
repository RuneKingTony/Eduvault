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

/** A valid v4 UUID for fixtures; give each fixture file its own range of `n` so ids never collide inside a spec. */
export const testId = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
