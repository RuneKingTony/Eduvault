# Writing and extending flows

Specs are in `apps/web-e2e/src/specs/`. The Playwright project is chosen by the file name:

| File pattern    | Project                   | Use                                                     |
| --------------- | ------------------------- | ------------------------------------------------------- |
| `*.api.spec.ts` | `api`                     | HTTP only, no browser: ACL, isolation, contract checks  |
| `*.web.spec.ts` | `web-admin`, `web-portal` | Browser, run once per SPA; `baseURL` is set per project |

## Skeleton

```ts
import { expect, test } from '@playwright/test';
import { loadFixture, requirePersona, shooter } from '../support/fixtures';
import { signedInAs, type Fixture } from '../support/personas';

let fixture: Fixture;
test.beforeAll(() => { fixture = loadFixture(); });   // never at module top level: --list has no fixture

test('owner sees the school roll', async ({ page }, testInfo) => {
  const shot = shooter(page, testInfo.project.name);  // step-NN-<name>.png under tmp/e2e/<run>/<project>/
  ...
  await shot('roll');
});
```

- `requirePersona(p)` first in any test that needs a persona that may be blocked.
- `signedInAs(persona)` gives an API client with a session; `page` for the browser, signing in through the real form.
- One `shot(...)` after every state worth looking at, named for the state: `sign-in-form`, `signed-in`, `campus-switched`.

## Creating records

Create through the API as a persona. Immediately record each one so a pass reverses it:

```ts
import { Ledger } from '../support/ledger';
import { ledgerPath } from '../support/env';

const res = await owner.post('/students', {
  campusId,
  fullName,
  admissionNumber,
});
const { id } = (await res.json()) as { id: string };
new Ledger(ledgerPath).add({
  kind: 'student',
  id,
  schoolId: fixture.personas.owner.schoolId,
  actor: {
    email: fixture.personas.owner.email,
    password: fixture.personas.owner.password,
  },
});
```

Ledger kinds are `student`, `campus` and `school`. A campus is removed together with its school (deleting one alone answered 403 in testing), so a new kind of record needs a reversal in `Ledger.reverse` first. Use unique admission numbers and names (`E2E-<label>-<runId>`); admission numbers are unique across schools.

## Assertions

Prefer status and body over text. Isolation checks assert the exact status: another school's row is **404, not 403**; a missing permission on a visible row is 403; no session is 401. Browser steps assert on roles and labels (`getByRole`, `getByLabel`). Scope a label to the header (`page.getByRole('banner').getByLabel('Campus')`): the Students page has its own "Campus" field.

## Driving a page you do not know

Use `playwright-cli` if present (`command -v playwright-cli`), against `http://localhost:4200` or `:4201` with the persona's email and password, to find labels and see the real DOM. Then write the spec. Without it, run a spec with `--headed --project=web-admin` and read the trace in `tmp/e2e/<run>/playwright/`.
