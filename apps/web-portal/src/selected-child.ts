import type { PortalChild } from '@eduvault/api-contract';

export const selectChild = (
  children: readonly PortalChild[],
  childId: string | undefined
): PortalChild | undefined =>
  children.find((child) => child.id === childId) ?? children[0];

export const childParam = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;
