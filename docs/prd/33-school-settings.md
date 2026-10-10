# PRD: School settings

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M2.2` (Settings frame, School profile, Admissions rules, Danger zone); `M3.4` (Payment rules and receipt wording); `M3.5` (Approval rules) (see [roadmap](README.md))
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md) (`school_setting`; school profile fields on `school_account`; approvals rule), [data-model-finance.md](../brainstorming/data-model-finance.md#settings) (approval rules, payment rules, receipt wording), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) (`schoolAccount`, `organization`), [technical reference](../technical-reference.md) decisions [D-001](../technical-reference.md#decision-log), [D-006](../technical-reference.md#decision-log), [D-007](../technical-reference.md#decision-log), [D-010](../technical-reference.md#decision-log), [D-011](../technical-reference.md#decision-log), [D-019](../technical-reference.md#decision-log), [D-021](../technical-reference.md#decision-log), [D-027](../technical-reference.md#decision-log), [D-028](../technical-reference.md#decision-log), [D-035](../technical-reference.md#decision-log). Sibling PRDs: [30](30-school-years-and-terms.md), [31](31-classes.md), [32](32-campuses.md), [53 payments](53-payments.md) (what the payment rules do), [03](03-foundation-ledger-and-documents.md) (file storage)

## Summary

Settings is one place for the rules a school owner can change: the school's name, logo and contact details; admissions rules (how many guardians, whether one is needed to admit); which money corrections need a second person; which ways to pay are accepted; and the owner-only Danger zone for handing over or deleting the school. It also frames School years and terms, Campuses and Roles, which have their own PRDs. Today Eduvault only has a `school_account` CRUD API with name and currency and no screen; this replaces it.

## Who uses it

| Persona (seed)                                     | Permission(s)                                                                               | What they can do here                                                                                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funmi Adeyemi, owner                               | every permission, holds the `owner` role                                                    | Every section, editable, including Danger zone                                                                                                                                                                        |
| Tunde Bakare, administrator (starter)              | `schoolAccount:read` (not `update`), `session:*`, `team:read/create/update`, `ac:read`      | School profile, Admissions rules, Approval rules and Payment rules read-only (inputs and switches disabled, no Save); School years and terms; Campuses; Roles. No Danger zone. The Settings link opens School profile |
| Grace Nwosu, principal (starter role)              | `team:read` only among settings permissions                                                 | Settings shows Campuses and Levels; the Settings link opens Campuses                                                                                                                                                  |
| Chika Eze, bursar; Emeka Obi, teacher; Kemi Lawson | none                                                                                        | No Settings link; settings routes redirect                                                                                                                                                                            |
| A custom role with `schoolAccount:update`          | `schoolAccount:read`, `schoolAccount:update`                                                | Edits profile, admissions, approval and payment rules                                                                                                                                                                 |
| Super admin acting                                 | read-only until a reason is given; with a reason, every permission but not the `owner` role | Read-only sections; with a reason, edits everything except handing over or deleting the school                                                                                                                        |

Scopes: settings are school-wide (one row per school). Another school's settings are unreachable (the active school decides the row); a direct id never appears in these routes. In the school without the permission answers 403.

## Screens

### Settings entry and frame

- **Side nav entry.** "Settings" (settings icon) sits at the bottom of the web-admin side nav, after every section. It shows when the person can open at least one settings item, links to the first item they can open (in the order below), and stays highlighted on every settings screen.
- **Frame.** Every settings screen renders inside a two-pane layout: a grouped section nav on the left, the page on the right. On phones the nav becomes a select labelled "Settings section" with option groups, and a first option "Choose a section" when the current page isn't one of the items.
- **Items**, in order, each shown only if its gate passes. Every settings page lives under `/settings/*`, except the three pages with their own PRDs, which keep their routes and sit under the Settings entry ([D-035](../technical-reference.md#decision-log)):

  | Group            | Item (icon)                          | Route                                            | Gate                                           |
  | ---------------- | ------------------------------------ | ------------------------------------------------ | ---------------------------------------------- |
  | General          | School profile (school)              | `/settings/profile`                              | `schoolAccount:read`                           |
  | General          | Admissions rules (users)             | `/settings/admissions`                           | `schoolAccount:read`                           |
  | General          | Approval rules (badge-check)         | `/settings/approvals`                            | `schoolAccount:read`                           |
  | School structure | School years and terms (calendar)    | `/calendar` ([30](30-school-years-and-terms.md)) | `session:read`                                 |
  | School structure | Campuses (building)                  | `/campuses` ([32](32-campuses.md))               | `team:read`                                    |
  | School structure | Levels (layers)                      | `/settings/levels` ([31](31-classes.md))         | `class:read`                                   |
  | Finance          | Payment rules (receipt)              | `/settings/payment-rules`                        | `schoolAccount:read`                           |
  | Access           | Roles and permissions (shield-check) | `/roles` ([21](21-roles-and-permissions.md))     | `ac:read`                                      |
  | Access           | Danger zone (shield-alert)           | `/settings/danger`                               | `organization:delete` or `organization:update` |

  The prototype used `/settings?tab=profile`, `?tab=people`, `?tab=money`, `?tab=danger` and `/finance/payment-rules`; the build doesn't keep them.

- Page anatomy (all settings sections): a page header (title and one-line description), then titled sections, each a card of rows with the label and description on the left and the control on the right.
- Breadcrumb: "Settings › {item label}".

### Settings (index)

- Route `/settings`. Phase label F0. Gate: any settings item passes.
- With `schoolAccount:read`, `/settings` opens School profile.
- Without it (someone who can open, say, only Campuses), the page shows: title "Settings", description "The parts of the school set-up you can open.", one section "Your settings" listing each item they can open as a clickable row (item icon, label, chevron) that navigates to it. Breadcrumb "All sections".

### School profile (M2.2)

- Gate `schoolAccount:read`; editable with `schoolAccount:update`.
- Header: title "School profile", description "Your school’s name, logo and contact details."
- Section **Logo**, description "Shown on receipts, charges and the parents’ portal."
  - One row: the school mark (52 px; the logo, or the school's initials on the brand crest), label "Your logo" or "No logo yet", description "Looks best as a square image." or "Until you add one, your initials are shown. PNG, JPG or WebP, up to 1 MB."
  - Controls (only with `schoolAccount:update`): a file button "Upload logo" (plus icon) or "Change" (refresh icon) when a logo exists; and "Remove" (ghost) when a logo exists.
  - Choosing a file uploads it at once (no Save), in two steps through the `FileStore`: `POST /files` with kind `school_logo`, then `PUT /school-account/logo` with the file id ([D-028](../technical-reference.md#decision-log)). Errors: "Choose a PNG, JPG or WebP logo." and "That logo is over 1 MB. Please choose a smaller one." Remove takes effect at once, no confirmation. **New** toasts: "Logo saved." / "Logo removed."
- Section **About the school**, description "Parents see these details on receipts and in the portal."

  | Field       | Type                                  | Required | Validation (all **new** except the required name) |
  | ----------- | ------------------------------------- | -------- | ------------------------------------------------- |
  | School name | text                                  | yes      | "Give the school a name." (max 120)               |
  | Address     | text, `autocomplete="street-address"` | no       | max 200                                           |
  | City        | text, `autocomplete="address-level2"` | no       | max 80 (**new** field)                            |
  | Phone       | tel                                   | no       | max 30                                            |
  | Email       | email                                 | no       | "Enter an email address like info@school.ng."     |

  Phone and Email sit side by side. Footer button "Save changes" (primary, check icon), only with `schoolAccount:update`; without it the fields are disabled. On save: toast (success) "School profile saved." Without permission (API 403): "You need permission to change school settings."

- Section **Money**: one row "Currency", "All fees, payments and receipts use Naira.", value "**Naira (₦)**". Read-only for everyone; the label comes from `school_account.currency`.
- States: loading skeleton; error `ErrorMessage`; read-only as above.

### Admissions rules (M2.2)

- Gate `schoolAccount:read`; editable with `schoolAccount:update`. Every control saves when changed; there is no Save button.
- Header: title "Admissions rules", description "Rules for admitting students and linking their families."
- Section **Guardians**:
  - "Most guardians per student", description "Students who already have more keep them." Number input, 1–6, default 4, aria-label "Most guardians per student". On change: toast (success) "A student can now have up to 3 guardians." ("1 guardian" in the singular). Out of range: the prototype clamps silently; the build answers 400 with "Choose a number from 1 to 6." (**new**).
  - "Guardian needed to admit", description "The admit form asks for at least one guardian. Switch off to add guardians later." Switch, default on; the whole row is the label when editable. Toasts: "A guardian is now needed to admit a student." / "A guardian can now be added after admission."
- Section **Logins and numbers**:
  - "Portal logins", description "Every guardian and student gets a login. They choose their own password the first time they sign in." Badge "Always on" (success, check icon). Not a setting.
  - "Admission number format": prototype only, hidden in production ([D-021](../technical-reference.md#decision-log)). The prototype shows it dimmed with the badge "Not active yet". There is no configurable format: numbers use `school_account.admission_prefix` (`GF-0123`), set when the school is created in M1.2 ([D-019](../technical-reference.md#decision-log)).

### Approval rules (M3.5)

- Gate `schoolAccount:read`; editable with `schoolAccount:update`. Switches save when changed.
- Header: title "Approval rules", description "Choose which money changes need a boss to say yes first."
- Section **Requests that need approval**, description "Switched on, the request waits in Approvals until a boss says yes. Switched off, it goes through straight away. Payments received never wait." One switch row per kind, all on by default:

  | Label                | Description                                 | Kind                                     |
  | -------------------- | ------------------------------------------- | ---------------------------------------- |
  | Refunds              | Paying money back to a family that overpaid | `refund`                                 |
  | Cancelling a balance | Giving up on money that will not be paid    | `write_off` (store write-offs follow it) |
  | Reducing a fee       | Lowering what a family owes                 | `credit_note`                            |
  | Discounts            | A percentage or amount off future charges   | `discount`                               |
  | Cancelling a payment | Undoing a receipt that was recorded wrongly | `payment_void`                           |

  Toasts: "These requests now wait for a boss to approve." / "These requests now go through straight away."

- Section **Who can approve**, description "Nobody can approve their own request." One row: badges "Owner" plus the label of every role holding `adjustment:approve` ("Principal" in the seed), description "Anyone with one of these roles can approve.", and a "Change roles" button (outline, arrow) to Roles, shown only with `ac:read`.

### Payment rules (M3.4)

This file owns the screen: route, layout and copy. What the switches do when a payment is recorded (which methods can be recorded, proof of transfer, refusing to switch off the last method) is owned by [53-payments](53-payments.md), business rules 8, 9 and 20. Where the two differ, 53 wins on behaviour.

- Route `/settings/payment-rules` ([D-035](../technical-reference.md#decision-log); the prototype used `/finance/payment-rules`), rendered in the Settings frame under **Finance**. Phase label F1. Gate `schoolAccount:read`; editable with `schoolAccount:update`. Switches save when changed.
- Header: title "Payment rules", description "How families can pay, and the discounts the school gives."
- Section **Ways to pay**, description "The choices staff see when they record a payment. Keep at least one switched on." Switch rows, all on by default:

  | Label         | Description                                          |
  | ------------- | ---------------------------------------------------- |
  | Cash          | Paid in person at the bursary.                       |
  | Bank transfer | Staff add the proof of transfer when they record it. |
  | POS           | Card payments on the school’s POS machine.           |

  Toasts: "Cash is now an option when recording a payment." / "Cash is no longer an option when recording a payment." (method label substituted). Switching off the last one is refused by the API ([53](53-payments.md) rule 20): the switch springs back and the toast (danger) reads "Keep at least one way to record a payment."

- Section **Discounts**: the "Sibling discount" row ("Not active yet" in the prototype) is hidden in production and the automatic sibling discount doesn't ship ([D-021](../technical-reference.md#decision-log)), so the section doesn't render. Sibling discounts are per-student discounts ([55](55-discounts-and-refunds.md)).
- Section **Receipt wording** (**new** copy): "Receipt footer" (text, max 120, default "Thank you for your payment.", hint "Printed at the bottom of every receipt.") and a "Save changes" button; toast "Receipt wording saved."

### Look and wording (hidden in the prototype)

The prototype builds this page but leaves it out of the settings nav on purpose ("hidden for now"). It is specified so the build knows what exists. It doesn't ship in v1: the receipt footer moves to Payment rules, brand colour and message sign-off aren't built (OD-33-5), and its "Not active yet" rows are hidden ([D-021](../technical-reference.md#decision-log)).

- Header: title "Look and wording", description "Colour, wording on receipts and messages, and how dates and money are shown."
- Card **Colour**: radio choices Teal (default), Blue, Purple, Maroon, each with a colour dot; a row "Light or dark", "Each person can also switch from the top bar.", button "Switch light/dark".
- Card **Wording**: "Receipt footer" (max 120, hint "Printed at the bottom of every receipt.", default "Thank you for your payment."); "Message sign-off" (max 80, hint "Added at the end of messages to guardians.", default "The bursar’s office"). Footer "Save changes". Toast "Look and wording saved."; invalid colour "Choose a colour."
- Card **Dates, money and numbers**: "Date and money format", "Today: 12 Oct 2026 and ₦45,000.", "Not active yet"; "Charge and receipt numbers", "Today: CHG-2026-00042 and RCT-2026-00088.", "Not active yet". Both are prototype only ([D-021](../technical-reference.md#decision-log)).

### Danger zone (M2.2)

- The nav item shows to holders of `organization:delete` or `organization:update`. Each section is gated by its own permission: Hand over the school by `organization:update`, Delete the school by `organization:delete`.
- With neither (direct visit): title "Danger zone", description "Only the owner can open this page.", warning callout "Handing over or deleting the school is limited to the owner."
- With either: title "Danger zone", description "Serious actions that are hard to undo. Take your time."
- Section **Hand over the school**, description "Make someone else the owner. You stay on the staff list but stop being the owner."
  - Field "New owner": select of staff members who aren't owners, labelled "Tunde Bakare · School administrator" (name and job title), first one chosen. Hint "If they are an administrator or principal, owner replaces that role."
  - No candidates: empty state "Nobody to hand it to", "Add another staff member first."
  - Footer button "Hand over the school…" (destructive, key icon), gate `organization:update`; disabled with tooltip "Add another staff member first" when there is no candidate.
  - Confirmation dialog: key icon, title "Hand the school to Tunde Bakare?", description "This changes who owns the school." Bullets:
    - "**Tunde Bakare** becomes an owner and can do everything, and stops being Administrator." (the clause after "everything" appears only when they hold administrator or principal; both are joined with "and").
    - "You stay on the staff list, but you are no longer an owner."
    - "Only an owner can hand it back."
    - Warning callout "You will lose access to this page as soon as you confirm."
    - Buttons "Cancel" (ghost) and "Hand over the school" (destructive), gate `organization:update`.
  - Refusals (danger toasts, API 403/409): "Refused: needs organization:update (403)." (shown as "You need permission to hand over the school." in the build, **new**: the prototype leaks the permission name); "Only an owner can hand over the school."; "Choose someone who is not already an owner."; the senior-role message from M1.3 ("Administrator and Principal can’t be held by the same person. Choose one senior role."); "Refused: the school can’t be left without an owner."
  - On success: toast (success) "Ownership handed to **Tunde Bakare**. You are now a member." and the app goes to the dashboard (the caller has lost the owner role).
- Section **Delete the school** (danger styling), description "Students, payments and results are never deleted, so a school with records can’t be deleted."
  - Row "Delete this school now", "Not allowed while the school has students or money records.", button "Delete school" (destructive, trash icon, small), gate `organization:delete`. Disabled with tooltip "Not allowed: the school has students and money records." while rule 18 blocks it.
  - **New** confirmation (the prototype never enables the button): title "Delete {school name}?", body "This deletes the school, its campuses, school years, classes, roles and settings, and removes every member from it. It cannot be undone.", a text field "Type the school’s name to confirm", buttons "Cancel" and "Delete school". On success the caller is signed in to their next school, or sees the no-school screen (M1.2).
  - Row "Delete automatically on a date" ("Not active yet" in the prototype): hidden in production, not shipped ([D-021](../technical-reference.md#decision-log)).

## Business rules

Settings storage and access

1. Each school has exactly one `school_account` row (profile) and one `school_setting` row (rules), both created when the school is created (`afterCreateOrganization`), never by a screen.
2. Reading a settings section needs `schoolAccount:read`; changing one needs `schoolAccount:update`. The values themselves are readable by any member of the school through the API, because the shell, receipts, the admit form and the payment form need them.
3. Every change records who made it and when (`updated_by`, `updated_at`).

Profile

4. The school name is required. Currency is fixed when the school is created and can't be changed (one currency per school).
5. A logo is PNG, JPEG or WebP, at most 1 MB, stored through the `FileStore` and `/files` ([D-028](../technical-reference.md#decision-log); [03](03-foundation-ledger-and-documents.md) rules 32–33). Uploading replaces the previous logo and deletes the old file; removing it shows the initials again.
6. The logo appears on receipts, charges, the portal header and the admin side nav crest.

Admissions

7. `max_guardians` is an integer from 1 to 6, default 4. Lowering it never unlinks guardians; it only blocks adding one to a student who is at or over the limit (enforced in M2.4: "A student can have at most 4 guardians").
8. With `require_guardian` on (default), admitting a student needs at least one guardian; with it off, admission may finish with none (enforced in M2.4).
9. Every guardian and student has a portal login; this isn't configurable.

Approvals (M3.5)

10. One switch per kind: `refund`, `write_off`, `credit_note`, `discount`, `payment_void`, all on by default. Store write-offs follow `write_off`. Payments never wait.
11. With a kind switched off, a new request of that kind is approved on creation with `approved_by` null (D-007).
12. Changing a switch affects requests created afterwards only; requests already waiting stay waiting ([D-027](../technical-reference.md#decision-log)).
13. "Who can approve" lists Owner and every role whose permissions include `adjustment:approve`.

Payment rules (M3.4). Behaviour is owned by [53-payments](53-payments.md); these rules only state what the settings hold.

14. Ways to pay are cash, transfer and POS, all on by default; at least one stays on (database check; the API refusal is [53](53-payments.md) rule 20).
15. How the switches affect recording a payment, including proof of transfer, is [53](53-payments.md) rules 8 and 9. Store sales (M4.4) record their payment through the same path ([53](53-payments.md) rule 22), so they offer the same methods. Switching a method off never changes recorded payments.
16. `receipt_footer` (≤ 120 characters) prints at the bottom of every receipt (M3.4).

Danger zone

17. Handing over: the caller holds `organization:update` and the `owner` role (D-006). The new owner is a staff member of the school who isn't an owner and isn't a portal-only account. They gain `owner` and lose `administrator` and `principal`; the caller loses `owner` and keeps their other roles (or `member` if none). The school always has at least one owner: the new owner is promoted before the caller is demoted.
18. Deleting the school needs `organization:delete` and the `owner` role (an acting super admin closes a school from the platform console instead, M1.5) and is allowed only when the school has no student and no money record (charge, payment, journal entry, adjustment, store sale, delivery or stock movement). The `ON DELETE RESTRICT` FKs from those tables to `organization` make the database refuse it too; configuration tables (campuses, years, classes, settings) cascade.
19. Better Auth's own organization delete route is switched off (`disableOrganizationDeletion`) or guarded by `organizationHooks.beforeDeleteOrganization` with rule 18, and its member-role route is guarded by `beforeUpdateMemberRole` for rule 17, so neither rule can be bypassed from the browser.

## Data

- `school_account` (exists: `id`, `organization_id` unique, `name`, `currency`, timestamps). Add, per [overview](../brainstorming/data-model-overview.md#foundation-model): `slug`, `city`, `address`, `phone`, `email`, and `logo_file_id` (the overview's `logo_key`, a foreign key to `file_object`, [D-028](../technical-reference.md#decision-log)). **New, not in the data model:** `admission_prefix` (the admission-number prefix, "GF", set when the school is created in M1.2, [D-019](../technical-reference.md#decision-log)), `updated_by`.
- `school_setting` (new, one row per school, `organization_id` primary or unique key), columns added slice by slice:
  - M2.2: `max_guardians SMALLINT NOT NULL DEFAULT 4 CHECK (max_guardians BETWEEN 1 AND 6)`, `require_guardian BOOLEAN NOT NULL DEFAULT true`, `updated_by`, `created_at`, `updated_at`.
  - M3.5: `approve_refund`, `approve_write_off`, `approve_credit_note`, `approve_discount`, `approve_payment_void`, each `BOOLEAN NOT NULL DEFAULT true`.
  - M3.4: `pay_cash`, `pay_transfer`, `pay_pos`, each `BOOLEAN NOT NULL DEFAULT true`, with `CHECK (pay_cash OR pay_transfer OR pay_pos)`; `receipt_footer TEXT NOT NULL DEFAULT 'Thank you for your payment.' CHECK (length(receipt_footer) <= 120)`.
  - Not in v1 (OD-33-5): `signoff`, `brand_colour` (the latter isn't in the data model).
- Migrations: M2.2 adds the profile columns, creates `school_setting`, and backfills a row (and a `school_account` row if missing) for every existing organization. M3.4 and M3.5 each add their columns with defaults, so existing rows need no backfill.
- The logo file goes through the `FileStore` and `/files`, which ship in this slice (M2.2) ([D-028](../technical-reference.md#decision-log); [03](03-foundation-ledger-and-documents.md)).
- Permissions: `schoolAccount: ['read', 'update']` (drops today's `create` and `delete`); `organization: ['update', 'delete']` (Better Auth defaults). Starter grants: administrator `schoolAccount:read`.

### What this replaces (existing `school-account` module)

| Today                                                                                              | After                                                                 |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /school-account` gated `schoolAccount:read`                                                   | Readable by any member of the school; returns the profile             |
| `POST /school-account` (`schoolAccount:create`)                                                    | Removed: the row is created with the school (rule 1)                  |
| `PATCH /school-account` with `{ name, currency }`                                                  | `{ name, city, address, phone, email }`; currency no longer patchable |
| `DELETE /school-account` (`schoolAccount:delete`) deleting only the row, under `ON DELETE CASCADE` | Removed. Deleting the school is `DELETE /school` under rule 18        |
| `schoolAccount: create, read, update, delete` in `libs/policy`                                     | `read, update`                                                        |

## API

Module `apps/api/src/app/modules/school-account` (exists) for profile and settings; a `school` module (or the same one) for handover and deletion. Contract under `contract.schoolAccount`, `contract.schoolSettings`, `contract.school`.

| Method | Path                   | Permission                                 | Request                                                                                                               | Response                                                                                                                                                                                                                                                                                | Errors                                                                                                                           |
| ------ | ---------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/school-account`      | signed in to the school                    |                                                                                                                       | `SchoolProfile` (`name`, `admissionPrefix`, `slug`, `city`, `address`, `phone`, `email`, `currency`, `logoUrl`)                                                                                                                                                                         | —                                                                                                                                |
| PATCH  | `/school-account`      | `schoolAccount:update`                     | `{ name?, city?, address?, phone?, email? }`                                                                          | `SchoolProfile`                                                                                                                                                                                                                                                                         | 400 (empty name, bad email), 403                                                                                                 |
| PUT    | `/school-account/logo` | `schoolAccount:update`                     | `{ fileId }` (uploaded first with `POST /files`, kind `school_logo`, [03](03-foundation-ledger-and-documents.md#api)) | `SchoolProfile`                                                                                                                                                                                                                                                                         | 400 (not a `school_logo` file of this school; type and size are checked by `POST /files`), 403                                   |
| DELETE | `/school-account/logo` | `schoolAccount:update`                     |                                                                                                                       | `SchoolProfile`                                                                                                                                                                                                                                                                         | 403                                                                                                                              |
| GET    | `/school-settings`     | signed in to the school                    |                                                                                                                       | `SchoolSettings` (`maxGuardians`, `requireGuardian`, `approvals: { refund, writeOff, creditNote, discount, paymentVoid }`, `paymentMethods: { cash, transfer, pos }`, `receiptFooter`, `approvers: string[]`). `paymentMethods` is here so the payment and store-sale forms can read it | —                                                                                                                                |
| PATCH  | `/school-settings`     | `schoolAccount:update`                     | any subset of the above except `approvers` and `paymentMethods`                                                       | `SchoolSettings`                                                                                                                                                                                                                                                                        | 400 ("Choose a number from 1 to 6."; footer too long), 403                                                                       |
| POST   | `/school/handover`     | `organization:update` and the `owner` role | `{ userId }`                                                                                                          | `{ ownerUserId }`                                                                                                                                                                                                                                                                       | 403 (not an owner), 404 (user not a member of this school), 409 (already an owner; portal-only account), 400 (senior-role clash) |
| GET    | `/school/deletable`    | `organization:delete`                      |                                                                                                                       | `{ ok: boolean, reason?: string }`                                                                                                                                                                                                                                                      | 403                                                                                                                              |
| DELETE | `/school`              | `organization:delete` and the `owner` role | `{ confirmName }`                                                                                                     | `{ id }`                                                                                                                                                                                                                                                                                | 400 (name doesn't match), 409 (rule 18), 403                                                                                     |

The payment methods are read and changed through `GET` and `PATCH /school-settings/payment-rules`, owned by [53-payments](53-payments.md#api). The Payment rules screen uses those for its switches and `PATCH /school-settings` for the receipt footer.

## Acceptance criteria

- **Entry, owner.** Given Funmi, then the Settings link opens School profile and the frame lists every item including Danger zone.
- **Entry, principal.** Given Grace, then the Settings link opens Campuses and the frame lists only Campuses.
- **Entry, bursar.** Given Chika, then there is no Settings link and `/settings/profile` redirects.
- **Index.** Given someone with only `session:read`, when they visit `/settings`, then they see "Settings", "The parts of the school set-up you can open." and one row "School years and terms".
- **Profile read-only.** Given Tunde, then the profile fields are disabled, there is no Save button and no logo controls; `PATCH /school-account` answers 403.
- **Profile save.** Given Funmi changes the phone, then the toast reads "School profile saved." and receipts show the new phone.
- **Logo.** Given a PNG under 1 MB, then `POST /files` returns an id, `PUT /school-account/logo` sets it and the side nav crest shows it. Given a 1.5 MB PNG, then `POST /files` answers 400 and "That logo is over 1 MB. Please choose a smaller one." shows; given a GIF, then 400 and "Choose a PNG, JPG or WebP logo."
- **Currency fixed.** Given any caller, when `PATCH /school-account` includes `currency`, then the field is ignored (it isn't in the update schema) and the currency is unchanged.
- **Max guardians.** Given Funmi sets 3, then the toast reads "A student can now have up to 3 guardians."; a student with 4 guardians keeps them, and adding a fifth (M2.4) is refused. Given 7, then 400.
- **Require guardian.** Given it's switched off, then the toast reads "A guardian can now be added after admission." and M2.4's admit flow can finish without a guardian.
- **Approval off (M3.5).** Given `refund` is off, when a bursar asks for a refund, then it posts at once with `approved_by` null and doesn't appear in Approvals.
- **Approval switch, pending (M3.5).** Given a refund waiting, when `refund` is switched off, then that refund still waits ([D-027](../technical-reference.md#decision-log)).
- **Approvers (M3.5).** Given the seed, then "Who can approve" shows Owner and Principal.
- **Last method (M3.4).** Given only Cash is on, when Funmi switches it off, then `PATCH /school-settings/payment-rules` answers 400 ([53](53-payments.md) rule 20), the switch stays on and the toast reads "Keep at least one way to record a payment."
- **Method off (M3.4).** Given POS is switched off through `PATCH /school-settings/payment-rules`, then "How they paid" on Record payment lists Cash and Bank transfer only, and `POST /payments` with `method: 'pos'` answers 400 ([53](53-payments.md) rule 8).
- **Receipt footer (M3.4).** Given Funmi saves the footer "Thank God for your payment.", then the toast reads "Receipt wording saved." and the next receipt's print view ends with it; a 121-character footer answers 400.
- **Hidden rows.** Given production, then no "Not active yet" row renders on any settings page and the Payment rules page has no Discounts section.
- **Handover.** Given Funmi hands over to Tunde, then Tunde's roles are member and owner (administrator removed), Funmi's are member, the toast reads "Ownership handed to **Tunde Bakare**. You are now a member.", and Funmi lands on the dashboard without the Danger zone.
- **Handover, not owner.** Given a custom role with `organization:update` but not the `owner` role, then `POST /school/handover` answers 403 "Only an owner can hand over the school."
- **Handover via Better Auth.** Given an owner calls Better Auth's own update-member-role route directly to make someone owner without the handover endpoint, then the `beforeUpdateMemberRole` hook applies rule 17 (senior roles stripped, at least one owner) or refuses.
- **Danger zone, update only.** Given a custom role with `organization:update` but not `organization:delete`, then the Danger zone item shows with Hand over the school and without Delete the school.
- **Delete refused.** Given Greenfield has students, then "Delete school" is disabled with "Not allowed: the school has students and money records." and `DELETE /school` answers 409.
- **Delete allowed.** Given a school with no students and no money records, when the owner types its name and confirms, then the organization, its campuses, years, classes, roles and settings are gone.
- **Isolation.** Given a member of school A, then every route above reads and writes school A's rows only; a second school's settings are unchanged by any call (integration test with two schools).

## Tests

- Unit: settings frame item visibility per permission set (owner, administrator, principal, bursar); the handover role arithmetic (rule 17, including the senior-role check); method switch refusing the last one (UI side; the API rule is tested in [53](53-payments.md)).
- Integration (`api:test-integration`):
  - `school_setting` and `school_account` isolation: a write in school A leaves school B's row unchanged; reads return the active school's row [tenancy-002].
  - 403 for each write without its permission; read-only acting super admin refused.
  - Database checks: `max_guardians` range, at least one payment method, footer length.
  - Logo: `PUT /school-account/logo` refuses another school's file id (400) and a file of another kind; replacing the logo deletes the old `file_object`.
  - Row created with every new school (hook) and backfilled by the migration.
  - Handover keeps at least one owner if the second Better Auth call fails (simulate failure); Better Auth's direct member-role route is guarded.
  - `DELETE /school` refused with one student; Better Auth's direct delete route refused.
- E2E (required, `eduvault-e2e`): owner uploads a logo and sees it in the side nav; owner switches POS off and the bursar no longer sees POS when recording a payment (M3.4); owner hands the school to the administrator and the administrator then sees the Danger zone.

## Open decisions

| #        | Question                                                                                                                                          | Recommendation                                                                                                                                                                                                                                                         | Confidence                                                                                       | Decided                                                                                                                                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OD-33-1  | Payment rules sits in the Settings frame but its prototype path is `/finance/payment-rules`, and the other General sections use `?tab=`. Routes?  | `/settings/profile`, `/settings/admissions`, `/settings/approvals`, `/settings/payment-rules`, `/settings/danger`; keep `/calendar`, `/campuses`, `/roles`                                                                                                             | Medium: one prefix per frame; file-based routes don't need tab params                            | [D-035](../technical-reference.md#decision-log): settings pages under `/settings/*`; Payment rules at `/settings/payment-rules`                                                                                          |
| OD-33-2  | The Danger zone item needs `organization:delete`, but handing over needs `organization:update`, so someone with update only can't reach it. Gate? | Show the item to holders of either; each section gated by its own permission; handover also needs the `owner` role                                                                                                                                                     | Medium: matches each action's real check                                                         | Adopted                                                                                                                                                                                                                  |
| OD-33-3  | Can any member read profile and settings values through the API, or only `schoolAccount:read` holders?                                            | Any member of the school (staff and portal) for `GET`; pages still gated. Names, logo and rules aren't sensitive and are needed by the shell, receipts and forms                                                                                                       | Medium: the alternative is copying values into every endpoint that needs them                    | Adopted                                                                                                                                                                                                                  |
| OD-33-4  | Receipt wording lives only on the hidden "Look and wording" page, but receipts (M3.4) print the footer. Where does it go in v1?                   | A "Receipt wording" section on Payment rules (footer only) in M3.4                                                                                                                                                                                                     | Medium: the footer has a consumer; the page that held it is hidden                               | Adopted                                                                                                                                                                                                                  |
| OD-33-5  | Ship the rest of "Look and wording" (brand colour, message sign-off) in v1?                                                                       | No. Brand colour fights the theme tokens; the sign-off has no consumer while SMS and email are out of scope                                                                                                                                                            | High: no consumer in v1                                                                          | Adopted                                                                                                                                                                                                                  |
| OD-33-6  | Admission number format ("Not active yet"). Ship a configurable format in v1? Where does the "GF" prefix come from?                               | No configurable format. Add `school_account.short_name` (2–4 capital letters) set when the platform creates the school (M1.2) and shown read-only in the row's description                                                                                             | Medium: the prefix exists in every admission number but nothing stores it today                  | [D-019](../technical-reference.md#decision-log): no configurable format; prefix is `school_account.admission_prefix`, set at school creation (M1.2); the row is hidden ([D-021](../technical-reference.md#decision-log)) |
| OD-33-7  | Sibling discount ("Not active yet"). Ship the automatic rule in v1?                                                                               | No. Per-student sibling discounts (M3.5) cover it; the finance doc already lists replacing them as open                                                                                                                                                                | High: two discount sources would double-discount                                                 | [D-021](../technical-reference.md#decision-log): hidden in production; not shipped                                                                                                                                       |
| OD-33-8  | Date and money format ("Not active yet"). Ship in v1?                                                                                             | No: one locale (en-NG, "12 Oct 2026", "₦45,000")                                                                                                                                                                                                                       | High: one country, one currency                                                                  | [D-021](../technical-reference.md#decision-log): hidden in production; not shipped                                                                                                                                       |
| OD-33-9  | Charge and receipt number formats ("Not active yet"). Ship in v1?                                                                                 | No: fixed by `document_sequence` (`CHG-2026-00042`)                                                                                                                                                                                                                    | High: the format is part of the money rules                                                      | [D-021](../technical-reference.md#decision-log): hidden in production; not shipped                                                                                                                                       |
| OD-33-10 | Automatic deletion on a date ("Not active yet"). Ship in v1?                                                                                      | No. It conflicts with never deleting students and money; closing a school is a platform job (suspend, M1.5)                                                                                                                                                            | High: risk-001                                                                                   | [D-021](../technical-reference.md#decision-log): hidden in production; not shipped                                                                                                                                       |
| OD-33-11 | Record who changed a setting?                                                                                                                     | `updated_by` and `updated_at` on both rows in v1; a change history (especially approval switches, a fraud control) later                                                                                                                                               | Medium: switching approvals off is the change most worth tracing                                 | Adopted                                                                                                                                                                                                                  |
| OD-33-12 | Does switching an approval kind off release requests already waiting?                                                                             | No; they stay waiting until approved or declined                                                                                                                                                                                                                       | Medium: approving silently in bulk would bypass the second person                                | [D-027](../technical-reference.md#decision-log): waiting requests keep waiting                                                                                                                                           |
| OD-33-13 | Where are logo files stored (and later proof of transfer)?                                                                                        | An S3-compatible bucket behind a small `FileStore` interface, local disk in dev; `logo_key` holds the object key; served through a short-lived signed URL                                                                                                              | Low: no infrastructure decision exists yet; finance needs the same for proofs                    | [D-028](../technical-reference.md#decision-log): Postgres `FileStore`, two-step upload via `/files`, `logo_file_id`                                                                                                      |
| OD-33-14 | School name lives in both `organization.name` (Better Auth) and `school_account.name`. Which is the authority?                                    | `school_account.name` for everything Eduvault shows; sync `organization.name` through `AuthService.api.updateOrganization` in the same request, which Better Auth checks against `organization:update`, so verify in a spike whether a server call can skip that check | Low: needs a Better Auth spike                                                                   | Adopted                                                                                                                                                                                                                  |
| OD-33-15 | City is a profile field in the data model and the platform form, but not in the School profile form. Add it?                                      | Yes, a "City" field after Address                                                                                                                                                                                                                                      | Medium: it's stored and shown in the platform console; staff should be able to fix it            | Adopted                                                                                                                                                                                                                  |
| OD-33-16 | Show "Not active yet" rows at all in production?                                                                                                  | No: hide them until they work; keep them in the prototype only. If the product owner wants them as a roadmap signal, show them exactly as the prototype does                                                                                                           | Low: product call; the prototype is the source of truth (D-001) but dead controls read as broken | [D-021](../technical-reference.md#decision-log): hidden in production                                                                                                                                                    |

## Prototype gaps noticed

- The school crest in the side nav and the portal header is hardcoded "GC"; the uploaded logo is never shown outside the profile page.
- `receiptFooter` and `signoff` are saved but nothing reads them; receipts don't print the footer.
- `requireGuardian` is never read: the admit flow always allows "No guardian for now".
- The store sale's payment picker always offers Cash, POS and Bank transfer, ignoring Payment rules.
- Danger zone gating mismatch (fixed above: either permission shows the item); a refusal toast leaks the permission name ("Refused: needs organization:update (403).").
- "Delete school" is always disabled; there's no confirmation for when it would be allowed.
- The handover candidate list would include portal accounts if they were in the member list; the prototype's list is staff only.
- The number input for most guardians clamps silently instead of refusing.
- Logo upload and removal give no confirmation toast; the data URL stands in for real storage.
- City isn't editable (added above); the admission prefix "GF" isn't stored anywhere (now `school_account.admission_prefix`, [D-019](../technical-reference.md#decision-log)).
- The administrator starter role can read but not change settings, so in a school without a custom role only the owner can change any rule; confirm that's intended.

## Dependencies

- M1.1 (permission list, guard, nav gating, `/me/permissions`) and M1.3 (members and the senior-role check used by handover).
- M1.2 (school creation through the platform console and `afterCreateOrganization`, where both rows are created and `admission_prefix` is set; [D-011](../technical-reference.md#decision-log), [D-019](../technical-reference.md#decision-log)).
- [03](03-foundation-ledger-and-documents.md): the `FileStore` and `/files`, shipped in M2.2 with the logo ([D-028](../technical-reference.md#decision-log)).
- [53-payments](53-payments.md): what the payment rules do, and `GET`/`PATCH /school-settings/payment-rules` (M3.4).
- M0.1 for the settings frame, switch rows, file button and dialogs in `libs/ui`.
- Consumers: M2.4 (max guardians, require guardian), M3.4 (payment methods, receipt footer, logo on receipts), M3.5 (approval switches, Approvals queue), M4.4 (store sale methods).
