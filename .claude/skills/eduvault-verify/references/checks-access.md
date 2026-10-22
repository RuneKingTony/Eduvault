# Access and tenancy

Flows: eduvault-e2e [M1.1](../../eduvault-e2e/references/flows.md), M1.2, M1.5, M1.3, M1.4.

### AC-01 · browser · owner

Do: Open :4200, sign in through the form with the owner's email and password, then sign out.
Expect: the dashboard loads with the school name; after sign-out the sign-in form shows; `GET /api/auth/get-session` returns `user.id` while signed in.

### AC-02 · browser · owner

Do: Sign in with a wrong password.
Expect: an error appears, no session is created (`get-session` has no `user`).

### AC-03 · api · none

Do: `GET /students`, `GET /approvals` and `GET /finance/payments` with no cookie.
Expect: 401 "Authentication is required" for each.

### AC-04 · api · foreign

Do: As `foreign` request the owner's student, class, payment and approval ids.
Expect: 404 for each, never 403.

### AC-05 · api · bursar2

Do: As `bursar2` (Ikeja) request a Lekki student and a Lekki payment.
Expect: 404.

### AC-06 · api · newhire

Do: As `newhire` (no roles) request `GET /students` and `GET /finance/payments`.
Expect: 403 `Missing permission ...`, naming the permission.

### AC-07 · browser · teacher

Do: Sign in as `teacher` and walk the sidebar.
Expect: only pages the role allows appear; opening Finance by URL shows a no-access state, not data.

### AC-08 · browser · superadmin

Do: Open /platform/schools, "Act in this school", then open Approvals (flows: EDU-37 step 7).
Expect: read-only until "Allow writes" with a reason is given; the audit log lists the write with the reason.

### AC-09 · browser · owner

Do: Open Members, add a member with two campuses, give a role, then open Roles and create a custom role.
Expect: the temporary password shows once (not screenshotted); the member appears with the role; the custom role lists its permissions.
