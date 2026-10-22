# What a check covers

Cover each section with these four kinds, planned from the PRD and the built screens. They are coverage categories, not the `api`/`browser` kind in the check header.

## happy

The flow works the way it was built to work: the primary action completes and the result is visible where a person would look for it (list row, total, statement, status). Follow the flow end to end across screens, including the portal side when a guardian or student sees the result.

## ux

- Navigation lands where expected: link, tab, redirect after save, back button.
- Success is signalled: toast, banner, dialog, row highlight or a changed status. Assert its text in the snapshot.
- Controls are right: a button is disabled while the form is invalid or the request is in flight, and enabled when it should be; no double submit.
- Dialogs open, close (Escape, cancel, outside click) and keep or clear their input as a person would expect.
- Empty, loading and error states render something sensible (no blank page, no raw error text, no `undefined`).
- Visibility: nothing is cut off, overlapped or unreachable at the default window; long names and many rows do not break the layout. Screenshot it.
- Console: no errors or React warnings during the flow; no failed request that the screen hides.

## permission

Repeat the same view and action as each role that should differ, from [personas](../../eduvault-e2e/references/personas.md): `owner`, `admin`, `bursar` (own campus), `bursar2` (other campus), `principal`, `teacher`, `newhire` (no roles), `student`, `guardian`, and `foreign` (another school).

- A role with the permission sees and can do it; a role without it does not see the control (UX) and the API refuses it with the exact status (403).
- Campus scope: a bursar sees only their campus's rows; another campus's row by id answers 404.
- Another school's row answers 404, never 403.
- No session answers 401.

## edge

- Required and malformed fields (empty, whitespace, too long, wrong format such as email or phone), with the message shown next to the field.
- Boundaries: zero, negative, decimals and very large amounts; dates at term edges.
- Duplicates and idempotency: submit twice, reuse a reference, repeat a void.
- Empty data: first-ever row, last row removed, no results for a search or filter.
- Ordering and state: act on something already voided, archived, paused or approved.
- Interrupted flow: reload mid-way, back button, expired session.

## What is not a check

A missing filter, a better label or a new feature is an idea for the `## Ideas` list, not a failure. Do not fail a check because the screen could be nicer.
