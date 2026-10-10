# PRD: Admission

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M2.4` (see [roadmap](README.md))
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md) (Foundation model, Student lifecycle, Rules every table follows), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) (Better Auth settings, phase 4a), [data-model-finance.md](../brainstorming/data-model-finance.md#fees-and-charging), [40-students](40-students.md), [42-guardians](42-guardians.md), [30 school years and terms](30-school-years-and-terms.md), [31 classes](31-classes.md), [33 school settings](33-school-settings.md), [technical reference](../technical-reference.md#decision-log) decisions `D-001`, `D-006`, `D-015`, `D-018`, `D-019`, `D-023`, `D-028`

## Summary

Admission puts a new student on the roll in one sitting: a four-step sheet (student, class, guardian, review) that creates the student, their enrolment for the current school year, their placement for the current term, their guardians with portal logins, and the student's own portal login. It replaces today's one-line "Add student" form, which takes a free-text admission number and creates nothing else.

## Who uses it

| Persona                          | Permission(s)                                                           | What they can do here                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Owner                            | every permission                                                        | Admit into any class on any campus                                                                    |
| Administrator (starter role)     | `student:create`, `enrollment:create`, `enrollment:place`, `guardian:*` | Admit into any class in their campus scope (the starter role holds `campus:readAll`, so every campus) |
| Campus-scoped admitter           | `student:create` without `campus:readAll`                               | Admit only into classes on their own campuses                                                         |
| Admitter without guardian rights | `student:create` without `guardian:link`                                | Admit only with no guardian, which needs "Guardian needed to admit" off (A-13)                        |
| Teacher, bursar, principal       | no `student:create`                                                     | The "Admit student" button and the command-menu action are hidden. A direct `POST` answers 403        |
| Super admin acting read-only     | read permissions only                                                   | Button hidden. A `POST` without `X-Eduvault-Acting-Reason` answers 403                                |
| Super admin acting with a reason | owner-level                                                             | Can admit; the audit row records the reason                                                           |

Scopes applied: campus scope only. The class list offers non-retired arms on campuses in the admitter's campus scope. An arm outside that scope answers 404 [tenancy-001]; in scope without `student:create`, or without the guardian permissions the payload needs (A-13), answers 403. Class scope does not apply to admitting.

## Screens

Admission has no route of its own. It is a sheet opened over the Students list ([40-students](40-students.md#students-list)).

### Entry points

- **Students list header:** primary button "Admit student" (icon `user-plus`), shown only with `student:create`.
- **Command menu** (web-admin, any screen): quick action "Admit a student", hint "People", shown only with `student:create`. It navigates to `/students` and opens the sheet.
- Opening the sheet always starts a fresh draft at step 1. Closing it (Cancel, the close button or Escape) discards the draft.

### Admit a student (sheet)

- Large sheet. Title "Admit a student". Under the title, a stepper with the four steps in lower case: "student", "class", "guardian", "review". Steps before the current one show a check.
- The sheet is one form. "Next" submits the current step and moves forward; "Back" keeps what was typed on the current step and moves back one step.
- Footer:
  - Step 1: "Cancel" (ghost) and "Next" (primary, arrow right).
  - Steps 2 and 3: "Back" (ghost, arrow left) and "Next".
  - Step 4: "Back" and "Admit and enrol" (primary, icon `user-plus`).

#### Step 1: student

| Field         | Control                          | Required | Default | Validation and message                                                                                       |
| ------------- | -------------------------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| First name    | text                             | yes      | empty   | Trimmed, 1–80 characters. Browser required check in the prototype; server message "Enter the first name."    |
| Last name     | text                             | yes      | empty   | Trimmed, 1–80 characters. Server message "Enter the last name."                                              |
| Gender        | select: "Female" (F), "Male" (M) | yes      | Female  | One of F, M                                                                                                  |
| Date of birth | date                             | yes      | empty   | A real date, on or before today. Server message "Choose a date of birth on or before today." (new; see gaps) |

First name and last name sit side by side; gender and date of birth sit side by side.

#### Step 2: class

- One field, label "Class for {current term name}" (prototype: "Class for First term"). A select of every non-retired class (arm) on a campus in the admitter's scope, each option "{level} {arm} · {campus}" (for example "JSS 2 Silver · Lekki"). Required. Default: the first option.
- Hint under the field: "Creates their {current school year} enrolment and a {current term name} placement." (prototype: "Creates their 2026/2027 enrolment and a First term placement.")
- Info callout: "Admitted mid-term? The bursar can charge this student on their own."
- If no class is offered (no arms in scope), the select is empty and "Next" is disabled; show "No classes on your campuses yet. Add a class first." (new copy; see gaps).

#### Step 3: guardian

- The step starts with one guardian draft, "Guardian 1", in **New guardian** mode with relationship "Mother", login "With their email" and "Pays the school fees" ticked.
- Each draft is a bordered card titled "Guardian {n}". It holds the guardian picker described in [42-guardians: Guardian picker](42-guardians.md#guardian-picker): a two-way switch "Existing guardian" / "New guardian", the fields for that mode, and the checkbox "Pays the school fees (receives the charges)".
- **Remove** (ghost, icon `x`) on a card:
  - Shown on Guardian 2 and later.
  - Shown on Guardian 1 only when the school's "Guardian needed to admit" setting is off.
- When no drafts are left (only possible with the setting off), an info callout reads: "No guardian for now. You can add one later from the student’s row."
- Below the cards:
  - While fewer than the school's maximum: a small button "Add another guardian" (or "Add a guardian now" when there are none), icon `plus`, then muted text "{n} of {max}".
  - At the maximum: muted text "A student can have at most {max} guardians."
  - A newly added draft starts in **Existing guardian** mode with relationship "Father" and "Pays the school fees" unticked.
- The existing-guardian select excludes guardians already chosen in another card of this draft.
- Guardian permissions (A-13):
  - Without `guardian:create`, "New guardian" is disabled in every card, and new cards start in Existing mode.
  - Without `guardian:link`, the step shows no cards and no add button, only the info callout "You can’t link guardians. Someone with guardian permissions can add them from the student’s row." (new copy). With "Guardian needed to admit" on, such a member can't admit at all, so the "Admit student" button and the command-menu action are hidden for them.
- On "Next", in this order:
  1. Any card in Existing mode with no guardian chosen: toast (danger) "Choose the existing guardian, or switch to New guardian." and stay on step 3.
  2. The same existing guardian chosen twice: toast (danger) "The same guardian is chosen twice." and stay.
  3. If there is at least one guardian and none has "Pays the school fees" ticked, Guardian 1 becomes the payer.
  4. New-guardian fields use the browser's required checks (full name, phone, house address, and email when the email login is chosen); the server repeats them (see [42-guardians](42-guardians.md#guardian-picker)).

#### Step 4: review

- A key-value list:
  - "Student": "**{first} {last}**"
  - "Date of birth": formatted date (`7 Oct 2026` style)
  - "Class": "{level} {arm} · {campus}"
  - "Student login": "`{school slug}-{number}` with a temporary password" (prototype: "`greenfield-0234` with a temporary password")
- Then one row per guardian: photo or initials avatar, name, a "Pays fees" badge (brand) if ticked, and a muted line "{relationship} · {login note}". On the right, a badge "Existing" (outline) or "New" (success).
- Login notes:
  - Existing guardian: "Existing guardian. Keeps their current login."
  - New, email login: "Signs in with {email} and a temporary password." ([42-guardians](42-guardians.md#business-rules) G-3)
  - New, username login: "Username `{username}` with a temporary password."
- The number shown in "Student login" is a preview. The real number is allocated on submit (rule A-9), so it can differ if someone else admits at the same time.
- **Possible duplicate** (new copy; rule A-14). When the review opens, the sheet checks for students in the school with the same first name, last name and date of birth. If any match, a warning callout sits above the key-value list:
  - Title "This may be a student you already have".
  - Body: one line per match, "{first} {last} · {admission number} · {state}", where state is the lifecycle badge text from [40-students](40-students.md#business-rules) S-8 ("Active", "Left", "Graduated" and so on). Each line links to that student's page in a new tab when the admitter can see the student; otherwise it shows "on another campus" instead of the number.
  - Under the lines: "Students are never deleted, so a duplicate can only be recorded as left. Check before you admit."
  - The primary button reads "Admit anyway" instead of "Admit and enrol" while the warning shows.

#### On "Admit and enrol"

- The server creates everything in one transaction (rule A-1).
- Success:
  - The sheet closes and the app navigates to the new student's page (`/students/{id}`).
  - Toast (success): "**{first} {last}** admitted as {admission number}." For example "**Peace Udoh** admitted as GF-0234."
  - With `invoice:bill` the toast has an action "Charge this student" that opens Charge students (M3.3). Without it, no action.
  - The one-time credentials are shown once, in the "Logins created" dialog below, opened over the new student's page.
  - An activity entry: "{first} {last} admitted ({admission number}), placed in {class}, with {guardian names joined by "and"} as guardian(s)." or "…, with no guardian yet." The prototype adds "New student, so the development levy applies when billed."; that clause belongs to M3.2 and is dropped here.
- Failure: the sheet stays open on step 4 and shows the server message in an error callout above the footer. Nothing is created.

### Logins created (dialog, new)

Opened once, right after a successful admission, over the new student's page. Every admission creates at least the student's login ([D-015](../technical-reference.md#decision-log)), so it always opens. All copy is new.

- Title "Logins created" (icon `key-round`). Description "Write these down or print them now. Temporary passwords are not shown again."
- One row per login created by this admission, student first, then new guardians in the order they were entered. Existing guardians are not listed: they keep their login.
  - Name in bold, then a muted line "Student" or "{relationship} of {student first name}".
  - "Username" (monospace) or "Email", and "Temporary password" (monospace), each with an icon button "Copy" (icon `copy`, tooltip "Copy"). Copying shows the toast "Copied."
  - A muted note: "They choose their own password the first time they sign in to the portal."
- Footer: "Print slip" (outline, icon `printer`) and "Done" (primary).
- **Print slip** opens the browser print view of a slip per login: school name and logo, "Portal login for {name}", the portal address, the username or email, the temporary password, and "Change this password the first time you sign in." One slip per page section, so the office can cut and hand them out.
- Closing the dialog (Done, the close button or Escape) asks nothing; the passwords are gone. A guardian's lost password is reset from their profile card ([42-guardians](42-guardians.md#guardian-profile-card-dialog), "Reset login"). A student's has no reset in this slice (see gaps).
- The passwords live only in the admission response held in memory; they are never cached, written to storage or put in the URL.

### States

- Loading: the class select and the existing-guardian select show a skeleton while their lists load.
- No current term: the "Admit student" button stays visible, but the sheet opens to a warning callout "Set a current term before admitting students." with a link "School years and terms" (gate `session:read`), and "Next" is disabled (new; see gaps).
- Denied: without `student:create` the button and the command-menu action are hidden; the API answers 403. They are also hidden for a member without `guardian:link` while "Guardian needed to admit" is on (A-13).
- Read-only (acting super admin without a reason): button hidden.

## Business rules

- **A-1 One transaction.** Admission creates, all or nothing:
  1. one `student` row;
  2. one `student_enrollment` for the current session, at the chosen arm's level, `status = 'active'`, `is_new_student = true`;
  3. one `enrollment_placement` for the current term, at the chosen arm and its campus;
  4. a `guardian` row and login for each new guardian;
  5. one `guardian_student` row per guardian draft;
  6. the student's portal login (see A-10).

  A failure at any step rolls back all of them. See the [Foundation model](../brainstorming/data-model-overview.md#foundation-model).

- **A-2 Student fields.**
  - First and last name are trimmed and non-empty.
  - Gender is F or M.
  - Date of birth is a valid date on or before today. "Today" is the Africa/Lagos date from the one shared helper ([D-023](../technical-reference.md#decision-log)).
  - `admitted_on` is today. `student.campus_id` (home campus) is the chosen arm's campus. Moving class later never changes the home campus.
- **A-3 Class.** The arm must belong to the school, must not be retired, and must be on a campus in the caller's campus scope. Otherwise the API answers 404 "Class not found".
- **A-4 Current term.** A current term must exist. Otherwise the API answers 409 "Set a current term before admitting students." The enrolment uses the current term's session.
- **A-5 Guardian count.**
  - The payload may carry 0 to `school_setting.max_guardians` guardians. More answers 400 "A student can have at most {max} guardians."
  - With `require_guardian = true`, zero guardians answers 400 "Add at least one guardian, or switch off “Guardian needed to admit” in Admissions rules."
  - The server enforces both. The prototype only hides buttons.
- **A-6 Existing guardians.** Each existing guardian id must belong to this school; otherwise 404 "Guardian not found". The same id twice answers 400 "The same guardian is chosen twice." Campus visibility of the picker is decided in [42-guardians](42-guardians.md#open-decisions).
- **A-7 Payer.** If there is at least one guardian and none has `pays_fees`, the first guardian in the payload gets `pays_fees = true`. Any number of guardians may pay.
- **A-8 New guardians.** New guardians follow [42-guardians](42-guardians.md#business-rules) rules G-1 to G-8 (fields, login kind, username, email uniqueness, photo).
- **A-9 Admission number.**
  - Allocated on submit from `document_sequence` with kind `admission`. Per school, not per year. Gaps are allowed: a rolled-back admission may burn a number.
  - Formatted `{prefix}-{number padded to 4}` (`GF-0123`). The number grows past 4 digits without truncating (`GF-10000`).
  - The prefix is `school_account.admission_prefix`, set when the school is created in M1.2 ([D-019](../technical-reference.md#decision-log)). `admission_number` stays `UNIQUE (organization_id, admission_number)`.
  - The stored value is the full string `GF-0123`. The 4-digit number alone feeds the student username.
- **A-10 Student login.**
  - Every admitted student gets a portal user: username `{school slug}-{number}` (`greenfield-0123`), a generated temporary password and `mustChangePassword = true`.
  - The user gets a placeholder email (permissions doc, Better Auth settings) that is never shown or sent to.
  - The student is a member of the school with the `student` starter role, so the student cannot use web-admin.
  - `student.user_id` is set.
  - Logins are created here, in M2.4, with the username plugin; the portal screens that use them ship in M2.8 ([D-015](../technical-reference.md#decision-log)). No admission skips the student's login.
  - Until an email provider exists, every temporary password, the student's and the guardians', is returned once in the response and shown in the "Logins created" dialog.
- **A-11 Mid-term admission.**
  - Admitting during a term creates that term's placement only. The student is not added to any charge round already issued.
  - The bursar charges them individually (M3.3). Because `is_new_student = true`, "new students" fee lines apply when they are charged ([finance: Fees and charging](../brainstorming/data-model-finance.md#fees-and-charging)).
  - Nothing is pro-rated in this slice.
- **A-12 No delete.** Students are never deleted [risk-001]. A wrongly admitted student is recorded as left with reason "Other" ([40-students](40-students.md)). The existing `DELETE /students/:id` and `student:delete` are removed.
- **A-13 Gate** ([D-018](../technical-reference.md#decision-log)).
  - `student:create` is required. It covers the enrolment and the placement: the role editor bundles it with `enrollment:create` and `enrollment:place`, so those are not checked separately.
  - When the payload carries guardians, `guardian:link` is also required, plus `guardian:create` if any guardian is new. Missing either answers 403 and nothing is created.
  - The guardian checks run in the service, after the handler's `student:create` guard.
- **A-14 Possible duplicate.**
  - A student in the same school with the same first name and last name (case-insensitive, trimmed) and the same date of birth is a possible duplicate. Archived students count.
  - It is a warning, never a refusal: `GET /admissions/duplicates` lists matches for the review step, and `POST /students` does not check it.
  - Matches outside the admitter's campus scope are returned with name and state only, never their id or admission number.
- **A-15 Logins shown once.** Temporary passwords are returned only in the `201` of `POST /students` and never stored in plain text or returned again (A-10).

## Data

- **Tables touched** (all in [data-model-overview: Foundation model](../brainstorming/data-model-overview.md#foundation-model)): `student` (changes listed under the table), `student_enrollment`, `enrollment_placement`, `guardian`, `guardian_student`, `school_setting` (read `max_guardians`, `require_guardian`), `document_sequence`, Better Auth `user` and `member`.
- **Migration** (this slice, shared with [40-students](40-students.md#data)):
  - Replace `student.full_name` with `first_name` and `last_name`. There is no production data, so no backfill.
  - Add `gender`, `date_of_birth`, `admitted_on` and `user_id` to `student`.
  - Create `student_enrollment`, `enrollment_placement`, `guardian`, `guardian_student` and `document_sequence`, if M3 has not created it yet.
- **Not in the data-model docs (flagged):**
  - `school_account.admission_prefix` (`text`, 2–6 uppercase letters, for example `GF`), added and set when the school is created in M1.2 ([D-019](../technical-reference.md#decision-log)). The overview says admission numbers carry "the school's short name", but no column held it. This slice only reads it; no screen changes it.
  - `document_sequence.year` is nullable, null for the `admission` kind (numbers run per school, not per year). The overview's key `(organization_id, kind, year)` becomes a unique index with `NULLS NOT DISTINCT`.
  - `student.created_by` and `guardian_student.created_by` (who admitted, who linked). Every action in the prototype names its actor in the activity feed.
  - An index `student (organization_id, lower(last_name), lower(first_name), date_of_birth)` for the duplicate check (A-14).
- "Today" comes from the Africa/Lagos helper ([D-023](../technical-reference.md#decision-log)); there is no school time-zone column.
- New guardians' photos go through the `FileStore` and `/files` ([D-028](../technical-reference.md#decision-log)), which ships in M2.2; see [42-guardians](42-guardians.md#data).

## API

The module stays `student`. Admission is a new handler on it, not a separate module, because it creates a student.

| Method | Path                     | Permission                                                                                                      | Request                                                                                                                                                                                                                                                                        | Response                                                                                                                                                                                   | Errors                                                                                                                                                                                                                                                    |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/students`              | `student:create` (plus the guardian permissions in A-13 when the payload has guardians, checked in the service) | `{ firstName, lastName, gender: 'F'\|'M', dateOfBirth, classArmId, guardians: Array<{ existingGuardianId, relationship, paysFees } \| { new: { fullName, phone, address, relationship, paysFees, photoFileId?, login: { kind: 'email', email } \| { kind: 'username' } } }> }` | `201 { student: StudentDetail, logins: Array<{ who: 'student'\|'guardian', guardianId?, username?, email?, temporaryPassword? }> }`. Temporary passwords are returned once and never again | 400 validation (A-2, A-5, A-6 duplicate); 403 missing permission; 404 class or existing guardian not found or out of scope; 409 no current term; 409 guardian email already used by another guardian in this school ([42-guardians](42-guardians.md) G-5) |
| `GET`  | `/admissions/preview`    | `student:create`                                                                                                | none                                                                                                                                                                                                                                                                           | `{ nextAdmissionNumber, nextStudentUsername, currentTerm: { id, name }, currentSession: { id, name }, maxGuardians, requireGuardian }`                                                     | 409 no current term                                                                                                                                                                                                                                       |
| `GET`  | `/admissions/duplicates` | `student:create`                                                                                                | query `firstName`, `lastName`, `dateOfBirth`                                                                                                                                                                                                                                   | `{ matches: Array<{ name, state, studentId?, admissionNumber? }> }`; `studentId` and `admissionNumber` only for students in the caller's scope (A-14)                                      | 400 missing field                                                                                                                                                                                                                                         |
| `GET`  | `/classes?active=true`   | `class:read` or `student:create` (owned by the classes PRD; the admit sheet needs it without class scope)       | none                                                                                                                                                                                                                                                                           | arms in campus scope                                                                                                                                                                       |                                                                                                                                                                                                                                                           |

- The existing-guardian picker uses `GET /guardians?q=` (`guardian:read`), specced in [42-guardians](42-guardians.md#api).
- The existing `POST /students` body (`fullName`, `admissionNumber`, `campusId`) is replaced. The admission number is never client-supplied, and the campus comes from the arm.
- `StudentDetail` is defined in [40-students](40-students.md#api).
- Contract types (`admitStudentSchema`, `admissionPreviewSchema`, `admissionDuplicatesSchema`, `loginCredentialSchema`) go in `@eduvault/api-contract`.
- Guardian photos are uploaded first through `/files` ([D-028](../technical-reference.md#decision-log)); the admission payload carries the returned `photoFileId`.

## Acceptance criteria

1. **Given** an administrator on step 1 with first name empty, **when** they press Next, **then** the step does not advance.
2. **Given** a valid step 1, **when** they reach step 2, **then** the class select lists only non-retired arms on campuses in their scope, labelled "{level} {arm} · {campus}", and the hint names the current school year and term.
3. **Given** "Guardian needed to admit" is on, **when** step 3 opens, **then** Guardian 1 has no Remove button. **Given** it is off, **then** Guardian 1 has one, and removing it shows "No guardian for now. You can add one later from the student’s row."
4. **Given** max guardians is 2 and two drafts exist, **then** "Add another guardian" is replaced by "A student can have at most 2 guardians."
5. **Given** a draft in Existing mode with nothing chosen, **when** Next is pressed, **then** the toast "Choose the existing guardian, or switch to New guardian." appears and the step stays.
6. **Given** two guardians with neither paying, **when** Next is pressed on step 3, **then** the review shows "Pays fees" on Guardian 1 only.
7. **Given** a complete draft, **when** "Admit and enrol" is pressed, **then**:
   - one student, one enrolment (`is_new_student = true`, status active), one current-term placement and the guardian links exist;
   - the toast reads "**{name}** admitted as GF-NNNN.";
   - the browser is on the new student's page.
8. **Given** the admitter holds `invoice:bill`, **then** the success toast offers "Charge this student". **Given** they do not, **then** it offers no action.
9. **Given** a guardian login by username, **when** admission succeeds, **then** the generated username and temporary password are shown once and the API never returns that password again.
10. **Given** a Lekki-only admitter, **when** they `POST /students` with an Ikeja arm, **then** the API answers 404 and nothing is created.
11. **Given** `require_guardian = true`, **when** the API receives zero guardians, **then** it answers 400 and nothing is created.
12. **Given** no current term, **when** the API receives an admission, **then** it answers 409.
13. **Given** two admissions submitted at the same moment, **then** they get different admission numbers.
14. **Given** a member without `student:create`, **then** the "Admit student" button and the command-menu action are absent, and `POST /students` answers 403.
15. **Given** a new guardian fails validation in the transaction (for example a duplicate email), **then** no student, enrolment or placement is left behind.
16. **Given** a member with `student:create` and `guardian:link` but not `guardian:create`, **when** they `POST /students` with a new guardian, **then** the API answers 403 and nothing is created; in the sheet, "New guardian" is disabled.
17. **Given** a member with `student:create` but not `guardian:link` and "Guardian needed to admit" on, **then** "Admit student" is hidden; with the setting off, the sheet's step 3 shows only the callout and admission finishes with no guardian.
18. **Given** Ada Okeke (born 3 Mar 2014) is already in the school, **when** an admitter reaches review for "ada okeke" born 3 Mar 2014, **then** the warning "This may be a student you already have" lists her and the button reads "Admit anyway"; pressing it admits a second student.
19. **Given** a Lekki-only admitter and a matching student on Ikeja, **then** the warning line shows the name, state and "on another campus", and `GET /admissions/duplicates` returns no `studentId` or `admissionNumber` for that match.
20. **Given** an admission with the student and one username guardian, **when** it succeeds, **then** the "Logins created" dialog lists the student and the guardian with copy buttons and "Print slip"; after "Done", reloading the student page shows no password anywhere.

## Tests

- **Unit**
  - `libs/policy`: `student:delete` is gone; `enrollment` and `guardian` resources exist.
  - api: admission-number formatting (`GF-0001`, `GF-10000`); username derivation `{slug}-{number}`; payer defaulting (A-7); the duplicate match (case and spaces ignored, date must match).
  - web-admin: wizard step navigation keeps typed values on Back; the remove-guardian visibility rule; max-guardians copy; review login notes; step 3 controls per guardian permission; the duplicate warning and the "Admit anyway" label; the "Logins created" rows, copy buttons and print slip.
- **Integration (`api:test-integration`)**
  - Isolation for each new table: a school-B student, enrolment, placement, guardian and link are invisible to school A, and school A cannot admit into a school-B arm or link a school-B guardian (404).
  - Campus scope: a Lekki-only admitter gets 404 for an Ikeja arm.
  - Permission: 403 without `student:create`; 403 with guardians but without `guardian:link`; 403 with a new guardian but without `guardian:create` (A-13).
  - Duplicates: `GET /admissions/duplicates` finds an archived match, never returns another school's students, and hides the id and number of out-of-scope matches.
  - Transaction rollback when a guardian email clashes.
  - Concurrent admissions get distinct numbers.
  - `require_guardian` and `max_guardians` enforced server-side.
  - Student login created with `mustChangePassword`.
- **E2E (required, `eduvault-e2e`)**
  - Administrator admits a student with one new email guardian and one existing guardian, lands on the student page, and sees both guardians and the class.
  - A campus-scoped admitter sees only their campus's classes.
  - The teacher persona has no Admit button.

## Open decisions

| #     | Question                                                                                                                                                                                                                                    | Options                                                                                                                                                                                                                                                             | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                 | Confidence                                                                                           | Decided                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ADM-1 | Admitting is gated only by `student:create`, yet it also creates the enrolment (`enrollment:create`), the placement (`enrollment:place`) and guardians (`guardian:create`, `guardian:link`). Which permissions does `POST /students` check? | (a) `student:create` only, as the prototype does; (b) `student:create`, plus `guardian:link` when the payload has guardians and `guardian:create` when any is new; (c) every permission the payload exercises, including `enrollment:create` and `enrollment:place` | (b). The role editor's "Students: can change" area already bundles `student:create` with `enrollment:create` and `enrollment:place`, so checking those separately adds nothing. Guardians are a separate area ("Parents and guardians"), and creating a login is a real capability. The UI hides the guardian step's controls when the permissions are missing, and with `require_guardian` on, the Admit button is hidden too | medium. The role editor's bundling settles the enrolment half; the guardian half is a judgement call | D-018: `student:create` plus `guardian:link`, and `guardian:create` for new guardians |
| ADM-2 | Where does the admission-number prefix come from?                                                                                                                                                                                           | (a) new `school_account.admission_prefix`, set when the school is created; (b) derive from the school name's initials; (c) no prefix                                                                                                                                | (a). Initials collide and change when the school is renamed, and numbers must never change                                                                                                                                                                                                                                                                                                                                     | high                                                                                                 | D-019: `school_account.admission_prefix`                                              |
| ADM-3 | When are portal logins (student and guardians) created, given the username plugin and portal land in M2.8 (permissions phase 4a)?                                                                                                           | (a) pull the username plugin, `user.username` and login creation into M2.4, and leave the portal screens, `readOwn` and `studentScope` in M5; (b) create records with `user_id` null in M2.4 and backfill logins when M2.8 lands; (c) move admission to M2.8        | (a). The admit flow, the "Portal login" row and the login badges all show logins. M1.2 already brings `createUser` with temporary passwords, so the plugin is the only extra piece                                                                                                                                                                                                                                             | medium. Depends on the M1.2 scope                                                                    | D-015: username plugin and logins in M2.4                                             |
| ADM-4 | Does admission always create the student's login? The settings say "Always on", but most seeded students show "Not created".                                                                                                                | (a) always at admission, with "Not created" only for imported or older records, plus a "Create login" action later; (b) optional per admission                                                                                                                      | (a), and the seed creates logins for the demo students the portal uses                                                                                                                                                                                                                                                                                                                                                         | high                                                                                                 | D-015: every admission creates the student's login                                    |
| ADM-5 | Can a student be admitted for the next term, for example during the holidays before a term starts?                                                                                                                                          | (a) current term only (prototype); (b) a term picker limited to the current and next term of the current session                                                                                                                                                    | (a) for M2.4, (b) as a follow-up. The prototype only offers the current term, and the move flow covers next-term placements                                                                                                                                                                                                                                                                                                    | medium                                                                                               | Adopted                                                                               |
| ADM-6 | Warn on a likely duplicate student (same names and date of birth in the school)?                                                                                                                                                            | (a) no check; (b) a soft warning on review with "Admit anyway"; (c) block                                                                                                                                                                                           | (b). There is no delete, so a duplicate can only be recorded as left                                                                                                                                                                                                                                                                                                                                                           | medium                                                                                               | Adopted                                                                               |
| ADM-7 | How are one-time credentials shown to the admitter?                                                                                                                                                                                         | (a) only in the toast, as the prototype does for guardians (`Green-7731`); (b) a "Logins created" dialog with copy buttons and a printable slip, shown once                                                                                                         | (b). Toasts vanish, and a family without email needs the slip                                                                                                                                                                                                                                                                                                                                                                  | medium                                                                                               | Adopted                                                                               |

## Prototype gaps noticed

- The admission number is `pad(S.students.length + 230, 4)` and the "GF-" prefix is hard-coded. Replace both with A-9.
- The wizard opens pre-filled with demo data (Peace Udoh, Mrs Udoh, `udoh.family@gmail.com`, JSS 2 Silver). Real defaults are empty, except Gender = Female and Guardian 1's defaults described in step 3.
- Step 2's label and hint hard-code "First term" and "2026/2027". They must use the current term and session.
- The date of birth has no `max`, so a future date passes. Add the check (A-2).
- Gender is not shown on the review step. Add a "Gender" row after "Date of birth".
- There is no state for "no current term" or "no classes on your campuses". New copy is proposed above.
- `require_guardian` and `max_guardians` are enforced only by hiding buttons. The server must enforce them (A-5).
- The guardian temporary password and the student's temporary password are never shown after admission. The prototype's add-guardian toast hard-codes `Green-7731`. The "Logins created" dialog replaces it (ADM-7).
- There is no duplicate check. The review step's warning is new (ADM-6).
- The guardian step offers "New guardian" to anyone with `student:create`. It now follows the guardian permissions (A-13).
- There is no way to reset a student's lost temporary password. Not in this slice; the staff reset flow is a follow-up.
- The activity line promises "the development levy applies when billed". That depends on M3 fee lines and is dropped from this slice.
- The existing-guardian picker lists every guardian in the school, whatever the admitter's campus scope. [42-guardians](42-guardians.md#open-decisions) GUA-2 limits it to visible guardians plus an exact phone or email match.
- Admission creates only the current-term placement. Placements roll forward when the next term is made current ([D-017](../technical-reference.md#decision-log), [40-students](40-students.md#open-decisions) STU-1).

## Dependencies

- M1.1: the permission list with `enrollment` and `guardian`, `student:delete` removed, and the guard.
- M1.2: server-side `createUser`, temporary passwords and `mustChangePassword`; the school's slug and `admission_prefix` set when the school is created ([D-011](../technical-reference.md#decision-log), [D-019](../technical-reference.md#decision-log)). The username plugin lands here in M2.4 ([D-015](../technical-reference.md#decision-log)).
- M2.1: a current term and session.
- M2.2: `school_setting.max_guardians` and `require_guardian`, the Admissions rules screen, and the `FileStore` with `/files` for guardian photos ([D-028](../technical-reference.md#decision-log)).
- M2.3: classes (arms) on campuses.
- [42-guardians](42-guardians.md), which ships in the same slice: the guardian picker and guardian creation.
- M3.3 for the "Charge this student" toast action (hidden until then).
- M2.8: the portal screens where these logins are used.
