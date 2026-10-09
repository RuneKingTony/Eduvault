import { errorSchema, type ApiErrorBody } from './schemas';
import type { Contract, RouteDef, RouteInput, RouteOutput } from './route';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody
  ) {
    super(body.message);
    this.name = 'ApiError';
  }
}

export type ApiClient<C extends Contract> = {
  [K in keyof C]: C[K] extends RouteDef
    ? (input: RouteInput<C[K]>) => Promise<RouteOutput<C[K]>>
    : C[K] extends Contract
      ? ApiClient<C[K]>
      : never;
};

export interface ClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  headers?: () => Record<string, string>;
}

const isRoute = (node: RouteDef | Contract): node is RouteDef =>
  'method' in node && 'path' in node && 'response' in node;

const fillPath = (path: string, params: Record<string, unknown> = {}) =>
  path.replaceAll(/:(\w+)/g, (_, key: string) =>
    encodeURIComponent(String(params[key]))
  );

const toQuery = (query: Record<string, unknown> | undefined) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

async function call(
  route: RouteDef,
  input: {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
  },
  options: ClientOptions
): Promise<unknown> {
  const doFetch = options.fetch ?? fetch;
  const url = `${options.baseUrl}${fillPath(route.path, input.params)}${toQuery(input.query)}`;
  const response = await doFetch(url, {
    method: route.method,
    credentials: 'include',
    headers: {
      ...options.headers?.(),
      ...(input.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(payload);
    throw new ApiError(
      response.status,
      parsed.success
        ? parsed.data
        : { code: 'UnknownError', message: response.statusText }
    );
  }
  return route.response.parse(payload);
}

export function createApiClient<C extends Contract>(
  contract: C,
  options: ClientOptions
): ApiClient<C> {
  const build = (node: Contract): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(node).map(([key, child]) => [
        key,
        isRoute(child)
          ? (input: Parameters<typeof call>[1] = {}) =>
              call(child, input, options)
          : build(child),
      ])
    );
  return build(contract) as ApiClient<C>;
}
