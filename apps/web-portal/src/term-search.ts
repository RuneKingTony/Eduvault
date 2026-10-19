import { textOf } from '@eduvault/shared';

export function termSearchOf(search: Record<string, unknown>) {
  const term = textOf(search['term']);
  return term === undefined ? {} : { term };
}
