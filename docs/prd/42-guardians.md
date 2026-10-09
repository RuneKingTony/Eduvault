# PRD: Guardians

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M2.4` (see [roadmap](README.md)); portal use of these logins is `M2.8`
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md#foundation-model) (`guardian`, `guardian_student`, `school_setting`), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) (Better Auth settings, New tables and fields, phase 4a), [41-admission](41-admission.md), [40-students](40-students.md), [33 school settings](33-school-settings.md), [technical reference](../technical-reference.md#decision-log) decisions `D-001`, `D-015`, `D-028`, `D-030`, `D-048`

## Summary

Guardians are the parents and carers linked to students. Each guardian has their own portal login, by email or by a username such as `okeke-family`. Any of a student's guardians can be marked as paying fees, which decides who receives the charges and whose family statement the student appears on. Staff add and link guardians when admitting a student or later from the student's row or page. The school sets how many guardians a student may have and whether admitting needs one.

## Who uses it

| Persona                      | Permission(s)                                                          | What they can do here                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Owner, Administrator         | `guardian:create`, `guardian:read`, `guardian:update`, `guardian:link` | See guardians, add new ones with logins, link existing ones, change a link, remove a link                                    |
| Bursar (starter)             | `guardian:read`                                                        | Sees guardians in the list's expand row, on the student page and in the profile card. Search matches guardian name and phone |
| Campus head (template)       | `guardian:read`                                                        | As the bursar                                                                                                                |
| Teacher                      | none                                                                   | No expand column and no guardian search. The student page's Guardians card is hidden (see gaps)                              |
| Guardian (portal)            | `student:readOwn` and the other `readOwn` permissions                  | Signs in to web-portal and sees linked children only (M2.8)                                                                  |
| Super admin acting read-only | read permissions                                                       | Sees everything; add buttons hidden                                                                                          |

Scopes: guardians carry no campus. A guardian is in a staff member's scope when they are linked to at least one student in that member's student visibility (campus scope plus class scope; see [40-students](40-students.md#scope-rules)). Class scope narrows guardian lists exactly as it narrows students ([D-048](../technical-reference.md#decision-log)). A guardian outside it answers 404. The guardian profile card lists only the children the viewer can see. Portal users are limited by `studentScope` (permissions doc, How far each person can see).

## Screens

Guardians have no screen or route of their own. They appear in four places.

### Expand row on the Students list

- Route `/students` ([40-students](40-students.md#students-list)). The first column is an icon-only toggle (chevron right, chevron down when open), tooltip "Guardians", label "Show guardians". It is present only with `guardian:read`.
- When open, a row spans the table under the student:
  - Heading "Guardians of {first name}".
  - On the right, the "Add guardian" button (ghost, small, icon `plus`), gate `guardian:link`. When the student already has the maximum, the button is disabled with tooltip "A student can have at most {max} guardians".
  - One line per guardian: photo or initials (opens the profile card), the name as a link (opens the profile card), a muted line "{relationship} · {phone}", a "Pays fees" badge (brand, tooltip "Pays the school fees and receives the charges") if they pay, and the login badge.
  - With no guardian: muted "No guardian linked yet."
- **Login badge** (success, check icon):
  - "Email login", tooltip "Signs in with {email}".
  - "Username login", tooltip "Username {username}".

### Guardians card on the student page

- Route `/students/$studentId`, Overview tab, second card in the first row. Title "Guardians", icon `users-round`.
- Card action: "Add guardian" (ghost, small, icon `plus`), gate `guardian:link`, disabled at the maximum with the same tooltip.
- Body: the same lines as the expand row. With none: an empty state with the icon `users-round` and the title "No guardian linked".
- Each line also gets a row menu (new; see gaps) with "Edit link…" and "Remove from {student first name}…", gate `guardian:link`.

### Guardian profile card (dialog)

- Opens from a guardian's photo or name anywhere they are listed. The photo button's label and tooltip: "About {name}".
- No title. Body:
  - A large photo or initials avatar, the name as a heading, the login badge, and "Pays the fees" (brand) if they pay for any child the viewer can see.
  - Rows:
    - "Phone": the phone number.
    - "Email": the email, or muted "None on file. Signs in with username `{username}`."
    - "House address": the address, or muted "Not recorded".
    - "Children": one line per linked child the viewer can see, "{student name} · {relationship}", or muted "None in your scope".
- Footer: "Close" (primary).
- With `guardian:update`, an "Edit details" button (new; see gaps) opens the edit dialog below.
- With `guardian:update`, a "Reset login" button (outline, icon `key-round`, new) opens the Reset login dialog below.

### Reset login (confirm dialog, new)

- Opened from "Reset login" on the profile card. All copy is new.
- Title "Reset {guardian name}’s login?" (icon `key-round`). Description "They get a new temporary password and must choose their own the next time they sign in. The old password stops working at once."
- For an email login, a muted line "Signs in with {email}."; for a username login, "Username `{username}`."
- Buttons: "Cancel" (ghost) and "Reset login" (primary).
- On success the dialog shows the result once, in place of its body:
  - "Username" or "Email", and "Temporary password" (monospace), each with a "Copy" icon button (toast "Copied.").
  - A "Print slip" button (outline, icon `printer`) printing the same slip as the "Logins created" dialog ([41-admission](41-admission.md#logins-created-dialog-new)).
  - Button "Done". Closing it loses the password for good.
- Activity entry: "{actor name} reset {guardian name}’s login." The password never appears in the activity, the audit log or any response after this one.

### Add a guardian (dialog)

- Opened by "Add guardian". Title "Add a guardian for {student name}". Description "Every guardian has their own login, so the family sees this child in the portal."
- If the student is already at the maximum, the dialog does not open; toast (danger) "A student can have at most {max} guardians."
- Body: the [guardian picker](#guardian-picker).
  - It opens in **Existing guardian** mode when the school has a guardian not yet linked to this student, otherwise in **New guardian** mode.
  - Relationship defaults to "Mother".
  - "Pays the school fees" is ticked only when the student has no guardian yet.
  - The existing list excludes guardians already linked to this student.
- Footer: "Cancel" (ghost) and "Add guardian" (primary, icon `user-plus`).
- On submit:
  - Existing mode with nothing chosen: toast (danger) "Choose the existing guardian, or switch to New guardian."
  - Over the maximum (a race): toast (danger) "A student can have at most {max} guardians."
  - Success, existing guardian: toast "**{guardian name}** linked to {student name}."
  - Success, new guardian with email login: "**{guardian name}** added with a login. They sign in with {email} and a temporary password." (G-3)
  - Success, new guardian with username login: "**{guardian name}** added with a login. Username `{username}`, temporary password `{password}`, changed at first sign-in."
  - The prototype's password `Green-7731` is a stub. The real one is generated and shown once, in the same "Logins created" dialog that admission uses ([41-admission](41-admission.md#logins-created-dialog-new)), instead of the toast.
  - Activity entry: "{guardian name} linked to {student name}."

### Guardian picker

Shared by admission step 3 and the add dialog.

- A two-way switch (radio group, label "Guardian type"): "Existing guardian" / "New guardian". Switching mode clears the chosen existing guardian.
- **Existing guardian mode**
  - Select "Guardian", required, first option "Choose a guardian". It lists the guardians the member can see (G-11). Each option reads "{name} · {phone} · {children's first names, comma separated}", the last part only if they have children.
  - Under the select, a search field "Or find by exact phone or email" (new copy). A guardian elsewhere in the school whose phone or email matches exactly is offered as "{name} (another campus)", with no phone or children shown (G-11). This is how siblings on different campuses are linked.
  - Hint: "Their login stays the same. This child appears in their portal."
  - If no guardian is left to choose: info callout "Every guardian in the school is already linked to this child. Choose New guardian instead."
  - Below: "Relationship to this child", a select of Mother, Father, Guardian.
- **New guardian mode**

  | Field                  | Control                                                                                                                                                                                      | Required                  | Default          | Validation and message                                                                                                        |
  | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
  | Full name              | text                                                                                                                                                                                         | yes                       | empty            | Trimmed, 1–120 characters. "Enter the guardian’s full name."                                                                  |
  | Phone                  | text (tel)                                                                                                                                                                                   | yes                       | empty            | Trimmed, 7–20 characters of digits, spaces, `+`, `-`. "Enter a phone number." (format rule new; see gaps)                     |
  | Relationship           | select: Mother, Father, Guardian                                                                                                                                                             | yes                       | Mother           | One of the three                                                                                                              |
  | House address          | text                                                                                                                                                                                         | yes                       | empty            | Trimmed, 1–200 characters. "Enter the house address."                                                                         |
  | Photo (optional)       | file: PNG, JPG, WebP. Button "Choose photo", or "Change photo" plus "Remove" once chosen; preview avatar. Choosing a file uploads it through `/files` at once (G-8)                          | no                        | none             | Wrong type: toast "Choose a PNG, JPG or WebP photo." Over 1 MB: toast "That photo is over 1 MB. Please choose a smaller one." |
  | How will they sign in? | radio. "**With their email**: They get a link to set their own password." / "**With a username**: No email needed. They get a username and a temporary password to change at first sign-in." | yes                       | With their email | One of the two                                                                                                                |
  | Email                  | email, shown only for the email login                                                                                                                                                        | yes, with the email login | empty            | A valid email. "Enter a valid email." Already a guardian here: 409 (G-5)                                                      |
  | Username               | read-only, monospace, shown only for the username login                                                                                                                                      | n/a                       | derived (G-4)    | Preview only; the server allocates the final one                                                                              |

- In both modes, last: checkbox "Pays the school fees (receives the charges)".

### Edit link (dialog, new)

- Title "Edit {guardian name}’s link to {student first name}".
- Fields: "Relationship to this child" (Mother, Father, Guardian) and the checkbox "Pays the school fees (receives the charges)".
- Buttons: "Cancel" and "Save".
- Toast: "Saved."
- If this would leave a student who has guardians with no payer: inline error "At least one guardian must pay the school fees." (G-7).

### Remove link (confirm dialog, new)

- Title "Remove {guardian name} from {student first name}?"
- Description: "{guardian name} will no longer see {student first name} in the portal or receive their charges. Their other children are not affected. Payments they made stay on record."
- When this is the guardian's last child in the school, an info callout adds: "{guardian name} has no other children here, so they will lose access to {school name} in the portal." (G-9).
- Callouts:
  - If they are the only payer: "Tick another guardian as paying fees first." The confirm button is disabled.
  - If `require_guardian` is on and this is the last guardian: "A student needs at least one guardian. Add another guardian first." Disabled (G-9).
- Buttons: "Cancel" and "Remove" (destructive). Toast: "**{guardian name}** removed from {student name}." Activity entry: "{guardian name} unlinked from {student name}."

### Edit guardian details (dialog, new)

- Gate `guardian:update`. Fields: Full name, Phone, House address, Photo (rules as above). Email and username are not editable in this slice: changing a login identifier needs a credential-reset flow that isn't built yet.
- Buttons: "Cancel" and "Save changes". Toast: "Saved."

### Admissions rules (settings)

Owned by M2.2 (Settings, "Admissions rules", section "Guardians"). Cited here because these rules depend on it:

- "Most guardians per student": number 1–6, default 4. Hint: "Students who already have more keep them." Toast: "A student can now have up to {n} guardian(s)."
- "Guardian needed to admit": switch, default on. Hint: "The admit form asks for at least one guardian. Switch off to add guardians later." Toasts: "A guardian is now needed to admit a student." / "A guardian can now be added after admission."
- "Portal logins": badge "Always on". Hint: "Every guardian and student gets a login. They choose their own password the first time they sign in."

### States

- Loading: the guardian list in the expand row and the card shows a skeleton.
- Without `guardian:read`: no expand column, no guardian search, no Guardians card, and no "Pays fees" names (see [40-students](40-students.md)).
- A guardian id out of scope or in another school: the API answers 404 and the profile card does not open.
- Read-only acting super admin: add, edit and remove are hidden.

## Business rules

- **G-1 One guardian, many children.** A guardian is one `guardian` row per school with one portal user. `guardian_student` links them to each child, with a `relationship` (mother, father, guardian) and `pays_fees`. `UNIQUE (guardian_id, student_id)`. See the [Foundation model](../brainstorming/data-model-overview.md#foundation-model).
- **G-2 Login always.**
  - Every new guardian gets a Better Auth user, a member row in the school with the `guardian` starter role, and `guardian.user_id`. `UNIQUE (organization_id, user_id)`.
  - Guardians sign in only to web-portal. The `guardian` role holds only `readOwn` permissions.
- **G-3 Email login.**
  - The user's email is the guardian's email.
  - The temporary password ships first: no email provider is on the roadmap. The guardian gets a generated temporary password with `mustChangePassword`, shown once to staff in the "Logins created" dialog, and the toast reads "**{guardian name}** added with a login. They sign in with {email} and a temporary password." A set-password link replaces this when an email provider lands (permissions phase 5).
- **G-4 Username login.**
  - Username: the name lower-cased; a leading title (`mr`, `mrs`, `ms`, `dr`, `chief`, `alhaji`, `alhaja`, with or without a dot) dropped; runs of non-letters turned into `-` and trimmed; then `-family` added (`Mrs Udoh` becomes `udoh-family`, `Emmanuel Etim` becomes `emmanuel-etim-family`).
  - On a clash, a suffix of 2, 3 and so on is added (`udoh-family2`). Uniqueness is platform-wide, checked against `user.username` inside the transaction and backed by its unique index. A guardian joining a second school keeps their first username.
  - The user gets a placeholder email that is never shown or sent to and is treated as personal data (permissions doc, Better Auth settings).
  - A temporary password with `mustChangePassword`, shown once.
- **G-5 Same email twice.**
  - An email already used by a guardian in this school answers 409 "{email} already belongs to {guardian name}. Link the existing guardian instead."
  - An email that belongs to a user in another school links that existing user, so one account works across schools (permissions doc). No new password is issued, and the toast says "They sign in with their existing login."
  - An email that belongs to a staff member of this school (a teacher who is also a parent) links that same user: the `guardian` role is added to their existing member row, and no new password is issued. Web-admin keeps their staff permissions; web-portal shows the children linked to them.
- **G-6 Maximum.**
  - A link that would take a student over `school_setting.max_guardians` answers 400 "A student can have at most {max} guardians."
  - Lowering the setting never removes links. Students over the new limit keep them but cannot add more.
- **G-7 Payers.**
  - Any number of a student's guardians may pay.
  - When guardians are added in one go and none is ticked, the first one pays (admission, [41-admission](41-admission.md) A-7).
  - When a guardian is linked to a student who has none, `pays_fees` defaults to true.
  - An edit or removal that would leave a student with guardians but no payer answers 409 "At least one guardian must pay the school fees." (new rule; the prototype has no edit or removal).
- **G-8 Photo.** PNG, JPEG or WebP, at most 1 MB, checked by the client and again by the server. It goes through the `FileStore` ([D-028](../technical-reference.md#decision-log)): the file is uploaded first through `/files`, and the guardian holds the returned id in `guardian.photo_file_id`. A file id uploaded by another school, or already attached to another record, answers 400.
- **G-9 Remove link.**
  - Deletes the `guardian_student` row only. `guardian_student` holds no money, so deleting it is allowed; the guardian, their login, their other links and every payment they made stay.
  - It is refused (409) when it would break G-7, or, with `require_guardian` on, leave an active student with no guardian. Left and graduated students may lose their last guardian.
  - A guardian left with no children in the school loses their membership of the school in the same transaction, so the portal no longer shows it. Their `guardian` row stays, so they can be re-linked later, which restores the membership. Their user account and any links in other schools are never touched.
- **G-10 Gates.**
  - Linking an existing guardian, editing a link and removing a link need `guardian:link`.
  - Creating a new guardian also needs `guardian:create`. The prototype checks only `guardian:link`, but the starter roles hold both.
  - Editing guardian details and resetting a login need `guardian:update`.
  - Reading needs `guardian:read`.
- **G-11 Visibility.** A guardian is visible to a staff member only when linked to a student that member can see, after campus and class scope ([D-048](../technical-reference.md#decision-log)). The profile card's children and "Pays the fees" badge are computed over the visible children only. One exception, for linking siblings: the existing-guardian picker also returns a guardian anywhere in the school whose phone or email matches the search exactly, with their name only.
- **G-12 Payer on charges.** `pays_fees` decides who receives charges and who is offered as the payer when a payment is recorded. That rule is M3 ([finance](../brainstorming/data-model-finance.md)); this slice only stores it. It does not decide what a guardian sees: every linked guardian sees each linked child's fees and purchases in the portal ([D-030](../technical-reference.md#decision-log)).
- **G-13 Reset login.** `guardian:update` on a visible guardian. Sets a new generated temporary password and `mustChangePassword` on the guardian's user, ends their sessions, and returns the password once. It is refused (409) for a guardian whose user is also a staff member of this school (G-5): staff passwords are reset through staff flows.

## Data

- **Tables:** `guardian` and `guardian_student` (new; [Foundation model](../brainstorming/data-model-overview.md#foundation-model)), `school_setting.max_guardians` and `require_guardian` (M2.2), Better Auth `user` (+ `username` via the username plugin, `mustChangePassword` from M1.2) and `member`.
- **Constraints:** `guardian_student` references `student` and `guardian` with `ON DELETE RESTRICT` and carries `organization_id`, which is included in both foreign keys, as every new domain table does.
- **Flagged against the data-model docs:**
  - `guardian.username` duplicates `user.username`. Drop it from `guardian` and read it from the user.
  - `guardian.email` holds the real contact email and stays. For username-only guardians it is null, while `user.email` holds the placeholder.
  - `guardian_student.created_by` and `created_at` (who linked, when). New.
  - `guardian.photo_file_id` (nullable FK to `file_object`, [D-028](../technical-reference.md#decision-log)) replaces the model's `photo_key`.

## API

| Method   | Path                                  | Permission                                      | Request                                                                                                                                                                                  | Response                                                                                                                                                                                                                                       | Errors                                                                                                                  |
| -------- | ------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/guardians?q=&excludeStudentId=`     | `guardian:read`                                 | `q` matches name, phone or email                                                                                                                                                         | `Array<{ id, fullName, phone?, childFirstNames?[], outsideScope }>`: guardians within visibility (G-11), plus any guardian in the school whose phone or email equals `q` exactly, returned with `id`, `fullName` and `outsideScope: true` only | 404 `excludeStudentId` out of scope                                                                                     |
| `GET`    | `/guardians/:id`                      | `guardian:read`                                 | none                                                                                                                                                                                     | `{ id, fullName, phone, email \| null, username \| null, address \| null, photoUrl \| null, children: Array<{ studentId, name, relationship, paysFees }> }`, children filtered to visible                                                      | 404 not in school or not visible                                                                                        |
| `GET`    | `/students/:id/guardians`             | `guardian:read` (and the student visible)       | none                                                                                                                                                                                     | `Array<{ guardianId, fullName, phone, relationship, paysFees, loginKind: 'email'\|'username', email?, username?, photoUrl? }>`                                                                                                                 | 404 student not visible                                                                                                 |
| `POST`   | `/students/:id/guardians`             | `guardian:link` (+ `guardian:create` for `new`) | `{ existingGuardianId, relationship, paysFees } \| { new: { fullName, phone, address, relationship, paysFees, photoFileId?, login: { kind: 'email', email } \| { kind: 'username' } } }` | `201 { link, login?: { username?, email?, temporaryPassword? } }`                                                                                                                                                                              | 400 validation or over the maximum; 403; 404 student or guardian not visible; 409 already linked; 409 email clash (G-5) |
| `PATCH`  | `/students/:id/guardians/:guardianId` | `guardian:link`                                 | `{ relationship?, paysFees? }`                                                                                                                                                           | the link                                                                                                                                                                                                                                       | 403; 404; 409 no payer left (G-7)                                                                                       |
| `DELETE` | `/students/:id/guardians/:guardianId` | `guardian:link`                                 | none                                                                                                                                                                                     | `{ studentId, guardianId }`                                                                                                                                                                                                                    | 403; 404; 409 last payer or last required guardian (G-9)                                                                |
| `PATCH`  | `/guardians/:id`                      | `guardian:update`                               | `{ fullName?, phone?, address?, photoFileId? \| null }`                                                                                                                                  | the guardian                                                                                                                                                                                                                                   | 400 (including a file id not uploaded by this school or already attached); 403; 404 not visible                         |
| `POST`   | `/guardians/:id/reset-login`          | `guardian:update`                               | none                                                                                                                                                                                     | `{ username?, email?, temporaryPassword }`, returned once                                                                                                                                                                                      | 403; 404 not visible; 409 the user is also staff here (G-13)                                                            |

- Photos are uploaded first through the shared `/files` endpoints ([D-028](../technical-reference.md#decision-log), specced in [03](03-foundation-ledger-and-documents.md)), with `kind: 'guardian_photo'`, PNG, JPEG or WebP and at most 1 MB ("Choose a PNG, JPG or WebP photo." / "That photo is over 1 MB. Please choose a smaller one."). The guardian routes take the returned `photoFileId`; `photoUrl` in responses is served through `/files`. There is no guardian-specific upload route.
- Contract types go in `@eduvault/api-contract`: `guardianSummarySchema`, `guardianDetailSchema`, `guardianLinkSchema`, `newGuardianSchema`, `resetLoginSchema`. `newGuardianSchema` is shared with admission.

## Acceptance criteria

1. **Given** a bursar with `guardian:read`, **when** they expand Ada's row, **then** they see Ngozi Okeke (Mother, "Pays fees", "Email login") and Ifeanyi Okeke (Father, "Username login"), and no "Add guardian" button.
2. **Given** a teacher without `guardian:read`, **then** the Students list has no expand column, and searching a guardian's phone finds nothing.
3. **Given** a student with 4 guardians and max 4, **then** "Add guardian" is disabled with the tooltip "A student can have at most 4 guardians", and `POST /students/:id/guardians` answers 400.
4. **Given** an administrator adds a new guardian "Mrs Udoh" with a username login, **when** they submit, **then** the username is `udoh-family` (or `udoh-family2` if taken), the temporary password is shown once, and the guardian's user has `mustChangePassword`.
5. **Given** a new guardian with an email already used by a guardian of this school, **when** they submit, **then** the API answers 409 and nothing is created.
6. **Given** a photo of 1.5 MB, **when** chosen, **then** the toast "That photo is over 1 MB. Please choose a smaller one." appears and no photo is attached.
7. **Given** a Lekki-only staff member opens Ngozi's profile card, **then** "Children" lists only Lekki children they can see.
8. **Given** a guardian who is the student's only payer, **when** staff try to remove the link, **then** the confirm is disabled and the API answers 409.
9. **Given** a non-payer guardian, **when** removed, **then** the link is gone, the guardian still signs in, and their other children are unchanged.
10. **Given** the school lowers max guardians from 4 to 2, **then** a student with 3 keeps all 3 and cannot add a fourth.
11. **Given** a guardian with an email in another school, **when** linked here by the same email, **then** no second user is created and they see both schools' children in the portal (M2.8).
12. **Given** a Lekki-only administrator and Ifeanyi Okeke linked only to an Ikeja child, **when** they search the picker for his name, **then** he is not offered; **when** they enter his exact phone number, **then** he is offered as "Ifeanyi Okeke (another campus)" with no phone or children, and linking him succeeds.
13. **Given** an administrator with `guardian:update` presses "Reset login" on a username guardian and confirms, **then** a new temporary password is shown once, the old password no longer signs in, and the guardian must change it at the next sign-in.
14. **Given** a member with `guardian:read` only, **then** the profile card has no "Reset login" button and `POST /guardians/:id/reset-login` answers 403.
15. **Given** a new guardian with a photo, **when** the photo is chosen, **then** it is uploaded through `/files` and the saved guardian's `photo_file_id` points at it; a photo file id from another school answers 400.
16. **Given** a guardian whose only link is removed, **then** they are no longer a member of the school and the portal no longer shows it; the `guardian` row and their user remain.
17. **Given** Emeka Obi (class-scoped to JSS 2 Gold) with `guardian:read` in a custom role, **then** `GET /guardians` lists only guardians of students placed in JSS 2 Gold this term.

## Tests

- **Unit**
  - api: username derivation, including titles, punctuation and the clash suffix; payer defaulting; G-7 payer protection; the picker's exact-match rule.
  - web-admin: the picker mode switch clears the selection; the login radio shows and hides the email and username fields; the photo type and size checks; the max-guardians disabled state.
- **Integration (`api:test-integration`)**
  - Isolation for `guardian` and `guardian_student`: school A cannot read, link, edit or unlink school B's guardians or links (404).
  - Every route above answers 404 across schools and outside campus visibility.
  - Permission matrix: 403 for `guardian:link` without `guardian:create` on a new guardian.
  - Max guardians enforced; email clash 409; cross-school email reuse links the same user.
  - Remove link refused for the last payer; `ON DELETE RESTRICT` from `guardian_student` to `student`.
  - Removing a guardian's last link removes their school membership in the same transaction; re-linking restores it.
  - The picker's exact phone or email match returns an out-of-scope guardian with name only, never their phone or children; a partial match returns nothing outside scope.
  - Class scope narrows `GET /guardians` and `GET /guardians/:id` as it narrows students.
  - Reset login: 403 without `guardian:update`, 404 out of scope, 409 for a staff user; the old password fails afterwards.
  - Photo: a file id from another school, or one already attached, answers 400.
- **E2E (opt-in)**
  - Administrator adds an existing guardian to a second child from the expand row; the guardian's profile card lists both children.
  - Administrator adds a username guardian; then sign in to web-portal with the shown credentials and get the change-password screen (with M2.8).

## Open decisions

| #     | Question                                                                                                                                                                                                     | Options                                                                                                                                                                                                                       | Recommendation                                                                                                                                                                                                                                        | Confidence                                                                   | Decided                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| GUA-1 | Guardian usernames are de-duplicated only within the school in the prototype, but `user.username` is platform-wide and a guardian account works across schools. `okeke-family` will collide between schools. | (a) global de-dupe with a numeric suffix; (b) prefix with the school slug like students (`greenfield-okeke-family`); (c) let staff edit the suggestion                                                                        | (a). It keeps the prototype's short `okeke-family` form, which parents type on phones. The clash check runs against `user.username` inside the transaction, backed by the unique index. A guardian joining a second school keeps their first username | medium                                                                       | Adopted                                                            |
| GUA-2 | Which guardians does the "Existing guardian" picker offer a campus-scoped member? The prototype lists every guardian in the school, which shows names, phones and children to people outside those campuses. | (a) every guardian in the school; (b) only guardians visible under G-11; (c) (b) plus an exact match on phone or email anywhere in the school, showing name only                                                              | (c). Siblings across campuses can still be linked without browsing other campuses' families                                                                                                                                                           | medium                                                                       | Adopted                                                            |
| GUA-3 | Where are guardian photos stored? There is no file store yet.                                                                                                                                                | (a) S3-compatible object storage behind a `FileStore` interface, private, served by signed URLs; (b) Postgres `bytea`; (c) leave photos out of M2.4 and add them with the first file feature (school logo, proof of transfer) | (c), with (a) as the target. Photos are optional, and M3.4's proof of transfer needs the same store                                                                                                                                                   | medium                                                                       | D-028: photos through the Postgres FileStore and `/files`, in M2.4 |
| GUA-4 | With "Guardian needed to admit" on, may staff remove a student's last guardian?                                                                                                                              | (a) refuse; (b) allow (the setting only governs admitting)                                                                                                                                                                    | (a), for active students; allowed for Left or Graduated students                                                                                                                                                                                      | low. The setting's copy only mentions the admit form                         | Adopted                                                            |
| GUA-5 | A new guardian's email belongs to a staff member of the same school (a teacher who is also a parent).                                                                                                        | (a) link the same user and add the `guardian` role to their member row; (b) refuse and ask for a different email                                                                                                              | (a). The guard combines roles, and the portal shows `readOwn` children while web-admin keeps staff permissions                                                                                                                                        | low. Needs a check that web-portal accepts a member who also has staff roles | Adopted                                                            |
| GUA-6 | Can staff change a guardian's email or switch login kind after creation?                                                                                                                                     | (a) no in M2.4; (b) yes with `guardian:update`, which re-issues a temporary password                                                                                                                                          | (a) for now. Changing a login identifier needs the M1.2 credential-reset flow                                                                                                                                                                         | medium                                                                       | Adopted                                                            |
| GUA-7 | A guardian whose last child link is removed: what happens to their login?                                                                                                                                    | (a) keep it; the portal shows "No children linked"; (b) remove their school membership; (c) ban the user                                                                                                                      | (b). Removing the membership removes portal access to this school, and the user can be re-linked later                                                                                                                                                | low                                                                          | Adopted                                                            |
| GUA-8 | How does a guardian who lost their temporary password get a new one?                                                                                                                                         | (a) a "Reset login" action on the profile card (`guardian:update`) that issues a new temporary password; (b) wait for email reset in phase 5                                                                                  | (a). Most Nigerian guardian logins will be by username                                                                                                                                                                                                | medium                                                                       | Adopted                                                            |

## Prototype gaps noticed

- There is no way to remove a guardian link, change the relationship, or change who pays fees after linking. The edit-link and remove-link dialogs above are new.
- There is no edit form for guardian details, so `guardian:update` gates nothing in the prototype.
- "Add guardian" checks only `guardian:link`, even when it creates a new guardian and login. `guardian:create` gates nothing.
- The student page's Guardians card is rendered without checking `guardian:read`, unlike the list's expand column. A teacher would see guardian names and phones. Gate it on `guardian:read`.
- The Active tab's "Pays fees" column shows guardian names without `guardian:read` ([40-students](40-students.md)).
- The temporary password in the add-guardian toast is hard-coded (`Green-7731`). The admission flow never shows any credentials.
- The username de-dupe checks only the school's guardians (GUA-1).
- The existing-guardian picker is not campus-scoped (GUA-2).
- A guardian who loses their temporary password has no way back in. "Reset login" is new (GUA-8).
- Phone numbers have no format check, and there is no duplicate check on phone.
- The prototype stores photos as data URLs in memory. The build uses the `FileStore` (GUA-3).
- The "set-password link" copy assumes an email provider that the roadmap does not schedule (G-3).
- The seeded guardian `okeke-father` does not follow the `-family` username pattern. That is harmless, since usernames are not re-derived.

## Dependencies

- M1.1: the `guardian` permissions in `libs/policy` and the guard.
- M1.2: server-side `createUser`, temporary passwords and `mustChangePassword`.
- The username plugin and the `guardian` starter role (permissions phase 4a), both pulled into M2.4 ([D-015](../technical-reference.md#decision-log)).
- M2.2: the `school_setting` guardian settings, the Admissions rules screen, and the `FileStore` with `/files` for photos ([D-028](../technical-reference.md#decision-log)).
- [40-students](40-students.md) for the list and the student page; [41-admission](41-admission.md) uses the picker.
- M2.8: the portal pages where guardians use their logins.
