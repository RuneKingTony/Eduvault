import type { Contract, RouteDef } from './route';
import type { ApiClient } from './client';

type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : { [K in keyof T]?: DeepPartial<T[K]> };

export type ApiFake<C extends Contract> = DeepPartial<ApiClient<C>>;

const isRoute = (node: RouteDef | Contract): node is RouteDef =>
  'method' in node && 'path' in node && 'response' in node;

const describeIssue = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type Handler = (input: CallInput) => unknown;

interface CallInput {
  params?: unknown;
  query?: unknown;
  body?: unknown;
}

function checkInput(route: RouteDef, input: CallInput, name: string): void {
  const parts = [
    ['params', route.params, input.params],
    ['query', route.query, input.query],
    ['body', route.body, input.body],
  ] as const;
  for (const [part, schema, value] of parts) {
    if (schema === undefined || value === undefined) {
      continue;
    }
    if (value instanceof FormData) {
      continue;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new Error(
        `${name} was called with a ${part} the contract rejects: ${describeIssue(result.error)}`
      );
    }
  }
}

/**
 * Wraps a hand-written fake API so each call is held to the real contract: the request
 * must satisfy the route's schemas and the answer must parse with the route's response
 * schema, exactly as the real client parses it. A fake that returns a non-UUID id, a
 * missing field or a method the contract does not have fails the test that uses it.
 */
export function contractChecked<C extends Contract>(
  contract: C,
  fake: ApiFake<C>
): ApiClient<C> {
  const wrap = (
    node: Contract,
    impl: Record<string, unknown>,
    trail: string
  ): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(impl).map(([key, value]): [string, unknown] => {
        const name = `${trail}${key}`;
        const child = node[key];
        if (child === undefined) {
          throw new Error(
            `The fake has ${name}, which is not in the contract.`
          );
        }
        if (!isRoute(child)) {
          return [
            key,
            wrap(child, value as Record<string, unknown>, `${name}.`),
          ];
        }
        if (typeof value !== 'function') {
          throw new TypeError(`The fake ${name} must be a function.`);
        }
        const handler = value as Handler;
        return [
          key,
          async (input: CallInput = {}) => {
            checkInput(child, input, name);
            const answer = await handler(input);
            const parsed = child.response.safeParse(answer);
            if (!parsed.success) {
              throw new Error(
                `${name} answered a body the contract rejects: ${describeIssue(parsed.error)}`
              );
            }
            return parsed.data;
          },
        ];
      })
    );
  return wrap(contract, fake, '') as ApiClient<C>;
}
