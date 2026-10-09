import { createContext, useContext, type ReactNode } from 'react';
import {
  contract,
  createApiClient,
  type ApiClient,
  type AppContract,
} from '@eduvault/api-contract';
import { actingHeaders } from './acting-store';
import { API_URL } from './env';

export type Api = ApiClient<AppContract>;

export const defaultApi: Api = createApiClient(contract, {
  baseUrl: API_URL,
  headers: actingHeaders,
});

const ApiContext = createContext<Api>(defaultApi);

export const ApiProvider = ({
  api = defaultApi,
  children,
}: {
  api?: Api;
  children: ReactNode;
}) => <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;

export const useApi = () => useContext(ApiContext);
