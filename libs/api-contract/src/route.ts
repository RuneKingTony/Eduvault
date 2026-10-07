import type { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RouteDef {
  method: HttpMethod;
  path: string;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
}

export const defineRoute = <const T extends RouteDef>(route: T): T => route;

export interface Contract {
  [key: string]: RouteDef | Contract;
}

export const defineContract = <const T extends Contract>(contract: T): T =>
  contract;

type Part<K extends string, S> = S extends z.ZodType
  ? Record<K, z.input<S>>
  : unknown;

export type RouteInput<T extends RouteDef> = Part<'params', T['params']> &
  Part<'query', T['query']> &
  Part<'body', T['body']>;

export type RouteOutput<T extends RouteDef> = z.output<T['response']>;
export type RouteBody<T extends RouteDef> = z.output<NonNullable<T['body']>>;
export type RouteQuery<T extends RouteDef> = z.output<NonNullable<T['query']>>;
export type RouteParams<T extends RouteDef> = z.output<
  NonNullable<T['params']>
>;
