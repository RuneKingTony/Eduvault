import type { SchoolYearList, Term } from '@eduvault/api-contract';
import type { Fixtures, TestUser } from '../base-test';

type Api = Fixtures['api'];

export async function termOf(
  api: Api,
  actor: TestUser,
  input: { year: string; sequence: number }
): Promise<Term> {
  const res = await api(actor).get('/school-years').expect(200);
  const list = res.body as SchoolYearList;
  const term = list.items
    .find((year) => year.name === input.year)
    ?.terms.find((candidate) => candidate.sequence === input.sequence);
  if (term === undefined) {
    throw new Error(`no term ${input.sequence} in ${input.year}`);
  }
  return term;
}

export async function makeCurrent(
  api: Api,
  actor: TestUser,
  input: { year: string; sequence: number }
): Promise<void> {
  const term = await termOf(api, actor, input);
  await api(actor).post(`/terms/${term.id}/make-current`).expect(200);
}
