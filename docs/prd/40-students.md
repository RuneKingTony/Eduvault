# PRD: Students

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M2.4` (list, student page, scope rules), `M2.5` (lifecycle: not seen since, back in school, record leaving, undo leaving, move for next term, placement roll-forward on make current, Start new school year, Graduated tab) (see [roadmap](README.md))
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md) (Foundation model, Student lifecycle, Class scope, Rules every table follows), [data-model-finance.md](../brainstorming/data-model-finance.md#fees-and-charging), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md#how-far-each-person-can-see), sibling PRDs [41 admission](41-admission.md), [42 guardians](42-guardians.md), [30 school years and terms](30-school-years-and-terms.md), [31 classes](31-classes.md), [33 school settings](33-school-settings.md), [technical reference](../technical-reference.md) decisions [D-001, D-006, D-014, D-016, D-017, D-023, D-029](../technical-reference.md#decision-log)

## Summary

The Students area is where staff find any student and see where they stand: on the roll, new this year, away, left or graduated. It shows each student's class this term, who pays their fees and, for finance staff, what they owe. The student page holds the profile, guardians, enrolment and placement history, and the lifecycle actions: mark not seen since, back in school, record leaving, undo leaving and move for next term. Once a year, "Start new school year" moves the whole roll up a level. Today the screen is a flat list with a free-text "Add student" form and a "Remove" button that deletes. That is replaced: students are never deleted, and their state is derived from dates.

## Who uses it

| Persona (seed)                    | Permission(s)                                                                                                                                                  | What they can do here                                                                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Funmi Adeyemi, owner              | every permission                                                                                                                                               | Everything, every campus                                                                                                                                    |
| Tunde Bakare, administrator       | `student:create/read/update/archive/markAway`, `enrollment:create/read/place`, `guardian:*`, `campus:readAll`, `class:readAll`, `invoice:read`, `payment:read` | Everything, every campus: admit, mark away, record and undo leaving, move, start the new school year (graduations included), see balances                   |
| Chika Eze, bursar (Lekki)         | `student:read`, `guardian:read`, `enrollment:read`, finance read                                                                                               | Every Lekki student (not class-scoped: no class permission), balances, guardians. No lifecycle actions. An Ikeja student answers 404                        |
| Yemi Alade, bursar (Ikeja)        | as Chika                                                                                                                                                       | Ikeja students only                                                                                                                                         |
| Emeka Obi, teacher (Lekki)        | `student:read`, `student:markAway`, `class:read`                                                                                                               | Only students placed this term in classes he teaches or is class teacher of. Can mark not seen since and back in school. No guardians, no money, no leaving |
| Grace Nwosu, principal (starter)  | `student:read`, `campus:readAll`, `class:readAll`, finance read                                                                                                | Every student and balance, read-only                                                                                                                        |
| Campus head (role template)       | `student:read/update`, `enrollment:read/place`, `guardian:read`, `class:readAll`, finance read                                                                 | Their campuses; can move for next term and start the new school year for their campuses, except graduations (no `student:archive`)                          |
| Kemi Lawson, member with no roles | none                                                                                                                                                           | No Students nav item; the route redirects                                                                                                                   |
| Super admin acting                | read-only without a reason                                                                                                                                     | Sees everything; every action hidden; a write without `X-Eduvault-Acting-Reason` answers 403                                                                |

Scopes applied: campus scope and class scope (see [Scope rules](#scope-rules)). Student scope applies only in web-portal (M2.8). Out-of-scope students answer 404; in scope without the permission answers 403 [tenancy-001].

## Screens

### Students list

- **Route** `/students`, web-admin. **Nav** section "People", first item (before "Staff and members"), icon `graduation-cap`. Phase F0. **Gate** `student:read`. Without it the nav item is hidden and the route redirects to the member's default route.
- **Header**
  - Title "Students". An info tooltip carries the scope tip (below).
  - Description "{scope note} · {n} shown". `{n}` counts the rows after search and filters, across all pages.
  - Actions:
    - "Start {year}" (outline, icon `calendar-plus`), gate `enrollment:place`, shown only while the action is offered (S-23). `{year}` is the target school year ("Start 2027/2028"). It opens the [Start new school year dialog](#start-new-school-year-dialog). The search param `?dialog=start-year` opens the list with the dialog open; the dashboard task and the School years page link there.
    - "Admit student" (primary, icon `user-plus`), gate `student:create`, opens the admit sheet ([41-admission](41-admission.md)).

  | Viewer        | Scope note                                       | Scope tip                                        |
  | ------------- | ------------------------------------------------ | ------------------------------------------------ |
  | Class-scoped  | "Students placed this term in {class, class, …}" | "You see the students in the classes you teach." |
  | Campus-scoped | "{campus, campus} campus"                        | "You see the students on your campus."           |
  | All campuses  | "All campuses"                                   | "You see students on every campus."              |

- **Tabs** (each with a count of the viewer's visible students in that group; search and filters do not change the counts):

  | Tab         | Who is in it                                                 |
  | ----------- | ------------------------------------------------------------ |
  | Active      | Lifecycle state Active (rule S-1), including new intakes     |
  | New intakes | Active students whose current-session enrolment is new (S-2) |
  | Inactive    | Lifecycle state Inactive (S-3)                               |
  | Left        | Left (S-5)                                                   |
  | Graduated   | Graduated (S-6)                                              |

  The New intakes tab shows an info callout above the card: "Students admitted in {current school year}. They are Active students, shown here so you can follow their first fees."

- **Toolbar** (in the table card):
  - Search, placeholder "Search name or {prefix} number" (prototype: "Search name or GF number"), where `{prefix}` is `school_account.admission_prefix` ([D-019](../technical-reference.md#decision-log)). Case-insensitive substring match on first name, last name and admission number. With `guardian:read` it also matches guardian names and phone numbers.
  - Campus select, label "Campus": "All campuses" plus each campus in scope. Shown only when more than one campus is in scope. It filters on the student's effective campus (S-9).
  - Level select, label "Level": "All levels" plus every class level. It filters on the level of the student's latest enrolment.
- **Table**
  - The whole row opens the student page.
  - 10 rows per page, with a pager "Showing {from} to {to} of {n}" plus Previous, page numbers and Next. The pager is hidden at 10 or fewer rows.
  - Paging, search, filters and tab counts run on the server in one query (STU-4; see API).
  - Leading columns on every tab:
    1. Expand toggle, only with `guardian:read`. Opens the guardians row ([42-guardians](42-guardians.md#expand-row-on-the-students-list)).
    2. "Student": initials avatar, bold "{first} {last}", and the admission number in monospace underneath.

  | Tab         | Further columns (in order)                                                                                                                                                                                                                                                                                                                                                                                                                 | Sort                          |
  | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
  | Active      | "Class" (this term's class, or muted "No class yet"); "Campus"\*; "Pays fees" (names of paying guardians, comma separated, or "—"; only with `guardian:read`, S-12); "School fees"†; "Status" (S-8 badge)                                                                                                                                                                                                                                  | Last name, first name (STU-3) |
  | New intakes | "Class"; "Campus"\*; "Admitted" (date); "Charged this term"† (₦); "Paid this term"† (₦, this term's allocations); "Still owes"†                                                                                                                                                                                                                                                                                                            | Last name, first name         |
  | Inactive    | "Class" (latest class); "Campus"\*; "Not seen since" (date, with tiny muted "Marked by {name}" under it); "Weeks away" (number); "Status" (the badge "Due to be marked Left" when due, otherwise small muted "Due to be marked Left {date}"); "Owes"†; a last column with the "Record leaving" button (ghost, small, icon `user-x`, gate `student:archive`) only when due. That button opens the student page with the leaving dialog open | Not seen since, oldest first  |
  | Left        | "Last class"; "Campus"\*; "Left on" (the last day attended, STU-8); "Reason" (the reason, or "Other", with the note in tiny muted text under it); "Still owes"†                                                                                                                                                                                                                                                                            | Left on, newest first         |
  | Graduated   | "Final class"; "Campus"\*; "Graduated" (date); "School year" (the graduation session name, or "—"); "Still owes"†                                                                                                                                                                                                                                                                                                                          | Graduated, newest first       |

  \* Only when more than one campus is in scope.
  † Only with `invoice:read` or `payment:read`. Not rendered until M3 provides balances.
  - Balance cells ("School fees", "Owes", "Still owes"): a red pill "₦{amount}" when owing, a pill "₦{amount} extra paid" when in credit, and a green pill "Paid up" at zero.
  - "Latest class": the class of the latest placement of the latest enrolment, or the level name if that enrolment has no placement, or "—".

- **Empty states** (per tab, when no row matches):

  | Tab         | Icon             | Title                | Description                                                                  |
  | ----------- | ---------------- | -------------------- | ---------------------------------------------------------------------------- |
  | Active      | `search`         | "No students match"  | "Try a different name, campus or level."                                     |
  | New intakes | `user-plus`      | "No new intakes"     | "Nobody admitted in {current school year} matches."                          |
  | Inactive    | `user-check`     | "Nobody is inactive" | "Every student has been seen in the last 5 weeks."                           |
  | Left        | `user-x`         | "Nobody has left"    | "Students recorded as leaving appear here."                                  |
  | Graduated   | `graduation-cap` | "No graduates yet"   | "Graduate a final-year class from its class page, or start the school year." |

- **Other entry points to a tab:**
  - The dashboard's students card (M2.6) opens a given tab.
  - The dashboard task "{n} student(s) due to be marked Left" opens Inactive (M2.6).
  - The "Left tab" toast action opens Left. The class page's "Graduated tab" toast action opens Graduated ([31-classes](31-classes.md)).
- **Loading:** skeleton rows. **Error:** the shared error message with the API's text.

### Student page

- **Route** `/students/$studentId`, web-admin, not in the nav (breadcrumb "Students › {first} {last}"). Phase F0. **Gate** `student:read`.
- **Not found** (the id does not exist, belongs to another school, or is outside the viewer's scope; the three are indistinguishable):
  - Title "Student not found".
  - A card with the empty state: icon `search`, title "We couldn’t find that student", description "It may have been moved, or it may belong to a campus or class you don’t look after.", and the button "Go back" (arrow left), which returns to `/students`.
- **Header**
  - Title "{first} {last}", followed by the lifecycle badge (S-8).
  - Description "{admission number} · {class this term}, {effective campus}", or "{admission number} · No class this term".
  - Action: "Statement" (outline, icon `receipt-text`), only with `invoice:read` or `payment:read`. It opens the student's statement (M3.4).
  - A "More actions" menu (ellipsis, icon-only). Items are hidden when their permission is missing; the menu is hidden when it has no items.

  | Item                                                                                | Shown when                                                                                                                               | Gate               |
  | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
  | "Move for next term" (icon `arrow-left-right`)                                      | Not archived; a next term exists in the current session; the student has a current-session enrolment; no placement for the next term yet | `enrollment:place` |
  | "Mark not seen since…" (icon `clock`)                                               | Not archived and not marked                                                                                                              | `student:markAway` |
  | "Back in school", or "Reactivate: back in school" when Inactive (icon `user-check`) | Not archived and marked                                                                                                                  | `student:markAway` |
  | separator, then "Record leaving…" (icon `user-x`, destructive)                      | Not archived                                                                                                                             | `student:archive`  |
  | "Undo leaving…" or "Undo graduation…" (icon `undo-2`)                               | Archived, and the term that was current when it was recorded is still current (S-19)                                                     | `student:archive`  |

- **Lifecycle callout** under the header, at most one:

  | Condition                          | Tone   | Copy                                                                                                                                                                                              |
  | ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Left or Graduated                  | info   | "{Left\|Graduated} on {date}. Off the roll and no longer billed; every record is kept.{owed}"                                                                                                     |
  | Inactive and due to be marked Left | danger | "Not seen since {date}, {n} weeks ago, and inactive for more than a term. Record the leaving when you are ready.{owed}", then the button "Record leaving" (danger, small, gate `student:archive`) |
  | Inactive                           | warn   | "Inactive since {inactive-from date}: not seen since {date}, and not billed for new terms. Due to be marked Left on {due date} if not back.{owed}"                                                |
  | Marked but still Active            | warn   | "Not seen since {date} ({n} weeks). Moves to Inactive on {inactive-from date} if the school hears nothing."                                                                                       |

  `{owed}` is " ₦{balance} is still owed and stays in Who owes." It appears only when the balance is above zero and the viewer holds `invoice:read` or `payment:read`. For a Left student, `{date}` is the last day attended (STU-8).

- **Tabs:** "Overview", and "Fees" only with `invoice:read` or `payment:read`.
- **Overview tab**
  - A two-column grid with two cards.
  - **Profile** (icon `user`), a key-value list:
    - "Admission no.": the number in monospace.
    - "Date of birth".
    - "Admitted".
    - "Home campus".
    - "Portal login": the username in monospace (`greenfield-0123`) and an "Active" status badge; "Closed" (muted) once the student is archived (S-16); or muted "Not created".
    - "Not seen since", only when marked: "{date} · marked by {name}", then the note on a second line when present (STU-9).
    - "Left" or "Graduated", only when archived: "{date} · {reason}{: note} · recorded by {name} on {record date}". For Left, `{date}` is the last day attended.
  - **Guardians**: see [42-guardians](42-guardians.md#guardians-card-on-the-student-page). Shown only with `guardian:read` (S-12).
  - **Enrolment and placement history** (icon `history`, collapsible, open by default). Description "The level and class for each school year and term." A table with no padding, newest school year first. It needs only `student:read` (STU-11):
    - "Session": the year name.
    - "Level".
    - "Class each term": one line per placement in term order, "{term}: **{class}**, {campus}".
    - "Status": the enrolment status badge (Active, Withdrawn, Completed), plus a "New student" badge (brand) when `is_new_student`.
- **Fees tab** (M3; hidden until finance exists)
  - Money tiles:
    - "Owing" ₦X when owing, "Extra paid" ₦X when in credit, "Owing" "Nothing" at zero.
    - "Paid" ₦X.
    - "Reduced" ₦X, only when there were reductions.
    - "Total" ₦X.
  - Then a primary button "Open statement" (icon `receipt-text`).
- **Loading:** skeleton cards. **Read-only acting:** the menu and every action are hidden.

### Mark not seen since (dialog)

- Title "{first} not seen since…" (icon `clock`). Description: "The first school day they were missed. After 5 weeks with no word from the family, they move to Inactive."
- Fields:
  - "Not seen since": date, required, at most today, default 7 days ago.
  - "Note": text, optional, placeholder "e.g. Phone calls to the family unanswered", hint "Optional. Shown on the student’s record." (STU-9).
- Buttons: "Cancel" (ghost) and "Save" (primary, icon `check`).
- A date after today: toast (danger) "Choose a date on or before today."
- On success:
  - Already 35 days or more ago (Inactive at once): toast (warning) "Over 5 weeks away, so {first} is now Inactive and won’t be billed for new terms."
  - Otherwise: toast (success) "Saved. {first} becomes Inactive on {date} if the school hears nothing."
  - Activity: "{name} marked not seen since {date}." followed by " More than 5 weeks, so now Inactive." or " Inactive from {date} if not back."

### Back in school (immediate action)

- No dialog. Clears the not-seen-since date, who marked it and the note.
- Toast (success):
  - If the student was Inactive: "{first} is Active again and will be billed from the next charge run."
  - Otherwise: "{first} is marked as back in school."
- Activity: "{name} is back in school." or "{name} is back in school and Active again."

### Record leaving (dialog)

- Title "Record {first} leaving" (icon `user-x`). Description: "Takes the student off the roll and out of future billing. Fees and history are kept; students are never deleted."
- Fields (reason and last day side by side):
  - "Reason": select of "Did not return", "Relocated", "Transferred to another school", "Fees", "Expelled", "Other". Default "Did not return" when Inactive, otherwise "Relocated". Required.
  - "Last day attended": date, at most today. Default: the not-seen-since date, else today.
  - "Note": text, optional, placeholder "e.g. Family moved to Abuja", hint "Shown on the student’s record and in recent activity." (STU-10).
- Warning callout when the balance is above zero (only with `invoice:read` or `payment:read`, S-13): "₦{balance} is still owed. It stays in Who owes under “owed by leavers”."
- Buttons: "Cancel" (ghost) and "Record leaving" (destructive, icon `user-x`).
- On success:
  - Toast (success) "Recorded as left. Nothing was deleted." with the action "Left tab".
  - Activity: "{name} recorded as left: {reason}. Balance ₦{balance} stays in Who owes."
- The dialog is also opened by the Inactive tab's "Record leaving" and by the danger callout's button.

### Undo leaving (dialog)

- Title "Undo {first}’s leaving?" or "Undo {first}’s graduation?" (icon `undo-2`). Description: "{first} goes back on the roll as if the {leaving|graduation} was never recorded. Use this only to correct a mistake."
- Body: the recorded line "{date} · {reason} · recorded by {name} on {record date}".
- Buttons: "Cancel" (ghost) and "Undo {leaving|graduation}" (primary, icon `undo-2`).
- On success:
  - Toast (success) "{first} is back on the roll."
  - Activity: "{name}’s {leaving|graduation} was undone by {actor}."
- After the term changes, the item is gone; a stale request answers 409 "A {leaving|graduation} can only be undone in the term it was recorded."

### Move for next term (dialog)

- Title "Move for next term". Description: "{current term} stays in {current class, or "the current class"}; {next term} gets a new placement."
- Field "{next term} class": a select of non-retired classes of the student's current-session level, on any campus (STU-2), each "{class} · {campus}". Default: the current class if it is still offered, otherwise the first option.
- When the chosen class is on a campus outside the mover's campus scope, an info callout: "{first} will no longer appear in your list from {next term}." (STU-2).
- Buttons: "Cancel" (ghost) and "Add placement" (primary).
- On success:
  - Toast (success) "{next term} placement added. {current term} is unchanged."
  - Activity: "{name} will move to {class}, {campus} from {next term}. {current term} records keep the old class."

### Start new school year (dialog)

A once-a-year bulk action that moves the roll into the next school year ([D-029](../technical-reference.md#decision-log)). It replaces nothing in the prototype, which has no way to move students between years; grading's promotion (F3) replaces it later.

- **Opened from:** the Students list header ("Start {year}"); the School years page, when "Make current" is pressed on next year's first term while students still need moving ([30](30-school-years-and-terms.md#make-current-of-next-years-first-term-dialog)); the dashboard task "{n} student(s) not in a class" ([70](70-dashboard.md)). Each opens `/students?dialog=start-year`.
- Large dialog, icon `calendar-plus`.
- Title "Start {target year}" (for example "Start 2027/2028").
- Description: "Ticked students move up a level for {target year}. Untick anyone repeating the year. Final-year students graduate."
- **Body**, one group per current class: the class of the student's latest placement in the year being left (S-24). Groups run in level order, then by campus name, then class name.
  - Group heading: "{class} ({campus})", an arrow, the target, and on the right "{n} students".
    - Target for a level with a next level: the class with the same name on the same campus at the next level ("JSS 2 Gold (Lekki) → JSS 3 Gold").
    - Target for a final-year level (no `next_level_id`): "Graduate".
    - When no non-archived class of that name exists at the next level on that campus, the target is a required select "Choose a {next level} class" listing the next level's non-archived classes, those on the same campus first, each "{class} · {campus}". Until one is chosen the group shows the inline error "Choose a class for {class} ({campus})." and the confirm button is disabled.
  - One checkbox per student, ticked by default, laid out in columns: the student's name. Unticking adds the muted note "(repeats {level})".
  - Repeaters stay in their current class. When that class is archived, the group gains a second required select "Class for those repeating", listing the same level's non-archived classes.
  - Students with no placement in the year being left (records made outside admission) form a group headed "{level} · no class", whose target is always a select.
  - Under a group with Inactive students (S-3): muted text "{n} inactive: {names}. Not moved. Mark them back in school to include them, or record their leaving." Inactive students have no checkbox.
  - Without `student:archive`, final-year groups show no checkboxes and the muted text "Graduating needs permission to record leavers. These students stay as they are for now." They are left out of the request.
- Above the groups, when some students already have an enrolment in the target year: info callout "{n} students are already in {target year} and are not listed."
- **Footer summary** (live): "{a} move up · {b} repeat · {c} graduate". Then muted text "Old year's charges stay on Who owes."
- Buttons: "Cancel" (ghost) and "Start {target year}" (primary, icon `calendar-plus`).
- On success:
  - Toast (success) "{target year} started: {a} moved up, {b} repeating, {c} graduated." While the target year's first term isn't current yet, the toast adds " Their new classes show once {first term} is made current." and, with `session:read`, the action "School years and terms".
  - Activity: one entry "{actor} started {target year}: {a} moved up, {b} repeating, {c} graduated." Each graduate also gets the graduation entry of S-6.
- A failure leaves everything unchanged and shows the server message in an error callout above the footer.
- **Loading:** skeleton groups while the preview loads. **Read-only acting:** the entry points are hidden.

The prototype's approved layout, for reference:

```
Start 2027/2028
JSS 2 Gold (Lekki)  →  JSS 3 Gold      32 students
  [x] Ada Okeke        [x] Bola Ade ...
  [ ] Tobi Lawal  (repeats JSS 2)
SS 3 Blue (Ikeja)   →  Graduate        18 students
312 move up · 4 repeat · 41 graduate
Old year's charges stay on Who owes.
             [Cancel]  [Start 2027/2028]
```

## Business rules

Lifecycle, as in [Student lifecycle](../brainstorming/data-model-overview.md#student-lifecycle). Every state is derived; no status column is stored. "Today" is the Africa/Lagos date from the one shared helper ([D-023](../technical-reference.md#decision-log)).

- **S-1 Active:** not archived (`exit_kind` null) and not Inactive.
- **S-2 New intake:** Active, and the enrolment for the current session has `is_new_student = true`. New intakes are a subset of Active, so the Active count includes them.
- **S-3 Inactive:** not archived, and `today − not_seen_since ≥ 35` days. Inactive from `not_seen_since + 35 days`.
- **S-4 Due to be marked Left:** Inactive, and `today ≥ not_seen_since + 35 + 98` days. Nothing changes by itself; staff record the leaving.
- **S-5 Left:** `exit_kind = 'left'`.
- **S-6 Graduated:** `exit_kind = 'graduated'`. It is recorded by "Graduate class" on a final-year class page ([31-classes](31-classes.md)) or by Start new school year (S-25), which set:
  - `exit_kind = 'graduated'`;
  - `exit_reason = 'completed'`, shown as "Completed {level}";
  - `graduated_session_id` = the school year being left (the current session for Graduate class);
  - `archived_at` = today, `archived_by` and `archived_term_id` = the current term;
  - the enrolment for that school year to `completed`;
  - the student's portal login closed, as in S-16.

  Activity: "{name} graduated: Completed {level}."

- **S-7 Weeks away** = `floor((today − not_seen_since) / 7)`.
- **S-8 Lifecycle badge:**
  - Due to be marked Left: the badge "Due to be marked Left" (destructive).
  - Active and marked: "Active" plus a warning badge "Not seen {n} wk" (icon `clock`), tooltip "Not seen since {date}. Inactive from {date} if the school hears nothing."
  - Otherwise one status badge: "Active" (success), "Inactive" (warning), "Left" (muted) or "Graduated" (primary).

Scope (see [Scope rules](#scope-rules)):

- **S-9 Effective campus** of a student = the campus of their current-term placement, else their home campus (`student.campus_id`). Campus scope, the Campus column and the Campus filter all use it.
- **S-10 Campus scope:** a member without `campus:readAll` sees a student only if the effective campus is one of their campuses.
- **S-11 Class scope** binds only members with `class:read` and without `class:readAll`.
  - They see a student only if the student has a current-term placement in an arm where they are a class teacher this session (any role) or a subject teacher this term.
  - A member with no class permission (a bursar) is not class-scoped.
  - Out-of-scope students answer 404 on every student route.
- **S-12 Guardian data needs `guardian:read`:** the expand column, guardian search terms, the "Pays fees" column and the Guardians card.
- **S-13 Money needs `invoice:read` or `payment:read`:** the balance columns, the Fees tab, the Statement button, the `{owed}` callout text and the leaving dialog's "still owed" callout. Finance never applies class scope.

Actions:

- **S-14 Mark not seen since** (`student:markAway`)
  - Needs a student who is not archived and not already marked; otherwise 409 "Already marked not seen since {date}." or 409 "{name} is no longer on the roll.".
  - The date must be on or before today: 400 "Choose a date on or before today."
  - The date must also be on or after `admitted_on`: 400 "Choose a date on or after {admitted}." This check is new.
  - Stores `not_seen_since`, `not_seen_by` (the caller) and `not_seen_note` (trimmed, at most 500 characters).
  - The note is shown on the profile to everyone with `student:read` (STU-9).
- **S-15 Back in school** (`student:markAway`) clears the three fields. It needs a marked, unarchived student; otherwise 409. A student who was Inactive is charged again from the next charge round ([finance](../brainstorming/data-model-finance.md#fees-and-charging)).
- **S-16 Record leaving** (`student:archive`)
  - Needs an unarchived student; otherwise 409 "{name} is no longer on the roll."
  - The reason must be one of the six listed; last day attended on or before today; note trimmed, at most 500 characters.
  - Sets `exit_kind = 'left'`, `exit_reason`, `exit_note`, `last_day`, `archived_at` = today, `archived_by` and `archived_term_id` = the current term.
  - Sets the current-session enrolment to `withdrawn`.
  - Closes the student's own portal login: their membership of the school (Better Auth `member` row) is removed, so the login no longer opens this school. The `user` row and `student.user_id` stay. Guardians keep seeing the child, marked archived ([72-portal](72-portal.md) R5).
  - Never deletes anything. The balance stays, and Who owes shows it under leavers (M3.4).
  - A placement already added for the next term is kept; the withdrawn enrolment keeps it out of charging and rosters (STU-7).
  - The Left tab and the profile show `last_day` as the date left; the record date is `archived_at` (STU-8).
- **S-17 Move for next term** (`enrollment:place`)
  - Allowed only when:
    - the current term has a next term in the same session;
    - the student is unarchived and has a current-session enrolment;
    - there is no placement for that next term yet.

    Otherwise 409 "{name} already has a {next term} placement." or 409 "There is no next term in this school year."

  - The arm must be in the school, not retired, and at the enrolment's level; otherwise 400 "Choose a {level} class.". An arm outside the school answers 404. Arms on any campus are allowed, including campuses outside the mover's scope (STU-2).
  - Inserts one `enrollment_placement` for the next term with the arm's campus. The current term's placement is never changed.
- **S-18 Placements are history.** No action edits or deletes a past or current placement. A move into another school year is Start new school year (S-23 to S-30), until grading's promotion replaces it.
- **S-19 Undo leaving** (`student:archive`, STU-6)
  - Allowed only for an archived student while the term in `archived_term_id` is still the current term; otherwise 409 "A {leaving|graduation} can only be undone in the term it was recorded."
  - Clears `exit_kind`, `exit_reason`, `exit_note`, `last_day`, `graduated_session_id`, `archived_at`, `archived_by` and `archived_term_id`.
  - Sets the enrolment the archive closed (`withdrawn` or `completed`) back to `active`, and restores the student's school membership so their portal login works again.
  - Re-admitting a student who left in an earlier term is a later flow.
- **S-20 No delete.** `DELETE /students/:id`, `student:delete` in `libs/policy`, and the web-admin "Remove" button are removed in M1.1 [risk-001] ([D-014](../technical-reference.md#decision-log)). `student` gets `ON DELETE RESTRICT` from its children, and from `organization` per the overview's rules.
- **S-21 Tab counts and "{n} shown".** The counts cover visible students before search and filters. "{n} shown" is the filtered total.
- **S-22 Activity.** Every lifecycle action writes an `activity_event` row with the copy above, the actor and the time, in the same transaction ([D-016](../technical-reference.md#decision-log); the table and its read side are specified in [70-dashboard](70-dashboard.md)).

Start new school year (M2.5, [D-029](../technical-reference.md#decision-log)):

- **S-23 When it is offered.** The target school year is:
  - while the current term is the last term of its school year: the school year that starts next, which must exist;
  - while the first term of a school year is current: that school year, for students who were not moved before it became current.

  The year being left is the school year before the target. The action is offered when a target exists and at least one student in the caller's scope is waiting (S-24). Otherwise the entry points are hidden and the API answers 409 "There is no school year to start. Create the next school year first." In any other term the action isn't offered.

- **S-24 Who is listed.** Students in the caller's campus scope (by effective campus, S-9) who are Active (S-1), hold an `active` enrolment in the year being left, and have no enrolment in the target year. Inactive students are named under their group but not moved. Archived students are never listed. Class scope does not narrow the list; the gate is `enrollment:place`.
- **S-25 Outcome per student.**
  - Ticked, at a level with a next level: **moves up.** A new enrolment in the target year at the next level, and a placement for the target year's first term in the group's target class.
  - Ticked, at a final-year level (`next_level_id` null): **graduates**, exactly as S-6, with `graduated_session_id` = the year being left. No new enrolment.
  - Unticked, at any level: **repeats.** A new enrolment in the target year at the same level, and a first-term placement in their current class, or the group's "Class for those repeating" when that class is archived.
  - The target class is the non-archived class with the same name at the next level on the same campus; failing that, the class staff picked for the group. A picked class may be on any campus (as STU-2).
  - Every new enrolment has `status = 'active'` and `is_new_student = false`. The home campus (`student.campus_id`) never changes.
- **S-26 The year being left.** Graduates' enrolments become `completed` (S-6). Movers' and repeaters' enrolments in the year being left are not changed, because a charge round for a term of that year reaches only `active` enrolments ([51](51-charge-students.md)).
- **S-27 Idempotent per student and year.** `student_enrollment` is `UNIQUE (student_id, session_id)`. A student who already has an enrolment in the target year, or who is already archived, is skipped and counted in `skipped`; nothing else changes for them. Retrying the same request creates nothing. A campus head can start their campuses and a colleague the rest; inactive students marked back in school can be moved by running it again.
- **S-28 All or nothing.** Every row is checked before anything is written, in one transaction. A class from another school, an archived class, a class at the wrong level, a graduation of a student whose level isn't final, or a move of one whose level is final answers 400 or 404 and writes nothing.
- **S-29 Gate.** `enrollment:place`. A request that graduates anyone also needs `student:archive`; without it the API answers 403 and writes nothing. A student outside the caller's campus scope answers 404.
- **S-30 The current term doesn't move.** The action never changes the current term. The new placements belong to the target year's first term, so lists, scope and class pages keep using the current term until someone with `session:setCurrent` makes that first term current ([30](30-school-years-and-terms.md)). Until then a student's history card shows the new year with its first-term class.

Placement roll-forward (M2.5, [D-017](../technical-reference.md#decision-log), STU-1):

- **S-31 Roll-forward on make current.** When a term is made current ([30](30-school-years-and-terms.md) rule 6), every `active` enrolment of that term's school year with no placement for that term gets a copy of its latest placement (same arm and campus), in the same transaction. Withdrawn and completed enrolments are not copied. It never crosses school years: an enrolment belongs to one year, so next year's first term gets placements only from Start new school year.

### Scope rules

| Viewer                                        | Sees                                                                         | Example (seed)                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `campus:readAll`, not class-scoped            | Every student in the school                                                  | Tunde, Grace, Funmi                                                                     |
| Campus members, not class-scoped              | Students whose effective campus (S-9) is one of theirs, whatever their class | Chika (Lekki) sees Ada (JSS 2 Gold, Lekki). `GET /students/st-femi` (Ikeja) answers 404 |
| Class-scoped (`class:read` without `readAll`) | The intersection of campus scope and students placed this term in their arms | Emeka Obi sees JSS 2 Gold, Lekki only. Femi (JSS 2 Emerald, Ikeja) answers 404          |

Consequences the build must keep:

- A student who moves to Ikeja for next term leaves Lekki's scope only when that term becomes current.
- A Left student who still has a current-term placement stays visible to that class's teachers on the Left tab. A graduate from last year (no current placement) falls back to their home campus and is invisible to class-scoped members.
- Within a school year, placements roll forward when a term is made current (S-31), so class scope carries over. Across years, students have a class in the new year's first term only once Start new school year has run for them; a student it skipped shows "No class this term" and appears in the dashboard task "not in a class".

## Data

- **Tables:** `student`, `student_enrollment`, `enrollment_placement` (new), `guardian_student` (read), `class_arm`, `class_level`, `term`, `academic_session` (read), `activity_event` (write). See [Foundation model](../brainstorming/data-model-overview.md#foundation-model).
- **Migration** (M2.4, shared with [41-admission](41-admission.md#data)):
  - Replace `student.full_name` with `first_name` and `last_name`.
  - Add `gender`, `date_of_birth`, `admitted_on` and `user_id`.
  - Create `student_enrollment` (`UNIQUE (student_id, session_id)`) and `enrollment_placement`. Both carry `organization_id` in composite foreign keys and use `ON DELETE RESTRICT` to `student`.
  - Change `student`'s foreign key from `organization` to `ON DELETE RESTRICT`.
  - Indexes: `enrollment_placement (organization_id, term_id, campus_id)` and `(organization_id, term_id, class_arm_id)` for scope, and `student (organization_id, last_name, first_name)` for sort.
  - `activity_event` is created in this slice ([D-016](../technical-reference.md#decision-log)); its columns are in [70-dashboard](70-dashboard.md#data).
- **Migration** (M2.5):
  - Add `not_seen_since`, `not_seen_by`, `not_seen_note`, `exit_kind` (check `left`, `graduated`), `exit_reason`, `exit_note`, `last_day`, `graduated_session_id`, `archived_at`, `archived_by` and `archived_term_id` to `student`. All but `archived_term_id` are listed in the overview.
  - Add a check that the `exit_*` and `archived_*` fields are null together.
  - `exit_reason` stores a code (`did_not_return`, `relocated`, `transferred`, `fees`, `expelled`, `other`, `completed`) mapped to labels, so a label change doesn't rewrite history. `completed` is used only with `exit_kind = 'graduated'` and is shown as "Completed {level}".
- **Not in the data-model docs (flagged):** `student.archived_term_id` (the term current when a leaving or graduation was recorded), for Undo leaving (S-19).

## API

Extends the existing `student` module. Contract types in `@eduvault/api-contract` replace today's `studentSchema`, `createStudentSchema` and `updateStudentSchema`. Start new school year lives in the `student` module too, because its gate and rules are about students; it reads the calendar through the calendar module's service.

| Method   | Path                           | Permission                                                        | Request                                                                                                                                                            | Response                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Errors                                                                                                                                                                                                      |
| -------- | ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/students`                    | `student:read`                                                    | query `tab` (`active`\|`new`\|`inactive`\|`left`\|`graduated`, default `active`), `q`, `campusId`, `levelId`, `page` (default 1), `pageSize` (default 10, max 100) | `{ items: StudentRow[], total, counts: { active, new, inactive, left, graduated }, startYear: { targetYearId, name } \| null }`. `StudentRow`: `id`, `firstName`, `lastName`, `admissionNumber`, `life`, `dueLeft`, `notSeenSince`, `notSeenBy {id, name}`, `weeksAway`, `currentPlacement {armId, className, campusId, campusName} \| null`, `latestClassName`, `effectiveCampus {id, name}`, `admittedOn`, `exit {kind, on, reason, note, recordedOn} \| null`, `graduatedSessionName`, `payers?: string[]` (only with `guardian:read`); finance fields added by M3 only with finance read. `startYear` is set only for holders of `enrollment:place` while S-23 offers the action | 404 `campusId` outside campus scope (as today); 400 bad query                                                                                                                                               |
| `GET`    | `/students/:id`                | `student:read`                                                    |                                                                                                                                                                    | `StudentDetail`: the row fields plus `gender`, `dateOfBirth`, `homeCampus`, `portalLogin { username, active } \| null`, `notSeenNote`, `archivedBy`, `history: Array<{ sessionId, sessionName, levelName, status, isNew, placements: Array<{ termName, className, campusName }> }>`, `nextTerm: { id, name } \| null`, `canMoveForNextTerm`, `canUndoLeaving`, `guardians?` (only with `guardian:read`)                                                                                                                                                                                                                                                                              | 404 not found or out of scope                                                                                                                                                                               |
| `POST`   | `/students`                    | see [41-admission](41-admission.md#api)                           |                                                                                                                                                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |                                                                                                                                                                                                             |
| `PATCH`  | `/students/:id`                | `student:update`                                                  | `{ firstName?, lastName?, gender?, dateOfBirth? }`                                                                                                                 | `StudentDetail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 400; 403; 404; 409 archived. No screen in the prototype (gap). `campusId` and `admissionNumber` are no longer editable                                                                                      |
| `POST`   | `/students/:id/not-seen`       | `student:markAway`                                                | `{ date, note? }`                                                                                                                                                  | `StudentDetail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 400 date; 403; 404; 409 already marked or archived                                                                                                                                                          |
| `POST`   | `/students/:id/back-in-school` | `student:markAway`                                                |                                                                                                                                                                    | `StudentDetail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 403; 404; 409 not marked or archived                                                                                                                                                                        |
| `POST`   | `/students/:id/leave`          | `student:archive`                                                 | `{ reason, lastDay, note? }`                                                                                                                                       | `StudentDetail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 400; 403; 404; 409 already archived                                                                                                                                                                         |
| `POST`   | `/students/:id/undo-leaving`   | `student:archive`                                                 |                                                                                                                                                                    | `StudentDetail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 403; 404; 409 not archived, or the term has changed (S-19)                                                                                                                                                  |
| `POST`   | `/students/:id/placements`     | `enrollment:place`                                                | `{ termId, classArmId }` (`termId` must be the next term)                                                                                                          | `StudentDetail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 400 wrong level or not the next term; 403; 404 student or arm; 409 placement exists, no next term, or archived                                                                                              |
| `GET`    | `/students/new-school-year`    | `enrollment:place`                                                |                                                                                                                                                                    | `{ targetYear: { id, name, firstTerm: { id, name, isCurrent } }, leavingYear: { id, name }, canGraduate, alreadyInTargetYear, groups: Array<{ fromClass: { id, name, campusName, archived } \| null, level: { id, name, isFinalYear }, nextLevel: { id, name } \| null, toClass: { id, name, campusName } \| null, classChoices: Array<{ id, name, campusName }>, repeatClassChoices: Array<{ id, name, campusName }>, students: Array<{ id, firstName, lastName, admissionNumber }>, inactive: Array<{ id, name }> }> }`, groups and students limited to the caller's campus scope (S-24)                                                                                           | 403; 409 nothing to start (S-23)                                                                                                                                                                            |
| `POST`   | `/students/new-school-year`    | `enrollment:place`, plus `student:archive` when any row graduates | `{ targetYearId, rows: Array<{ studentId, outcome: 'move' \| 'repeat' \| 'graduate', classArmId? }> }` (`classArmId` required for `move` and `repeat`)             | `{ moved, repeating, graduated, skipped }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 400 class at the wrong level, archived class, outcome not allowed for the level, missing class; 403 (S-29); 404 student out of scope, class or year not in the school; 409 the year isn't the target (S-23) |
| `DELETE` | `/students/:id`                | removed in M1.1 (D-014)                                           |                                                                                                                                                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |                                                                                                                                                                                                             |

- Every handler filters by `ctx.organizationId`, campus scope (S-9, S-10) and class scope (S-11) before the permission-specific checks. The existing `list` and `get` filter on `student.campus_id`; they must switch to the effective campus. Start new school year applies campus scope only (S-24).
- `OrgContext` gains `classScope` (permissions doc phase 4b, delivered here by the class model in M2.3).
- `GET /students/:id` is the target of the access lab's sample requests `GET /students/st-ada` and `GET /students/st-femi`.
- The roll-forward of S-31 runs inside `POST /terms/:id/make-current` ([30](30-school-years-and-terms.md#api)), through a placement service exported by the `student` module.

## Acceptance criteria

1. **Given** Chika (bursar, Lekki), **when** she opens `/students`, **then**:
   - the description reads "Lekki campus · {n} shown" and there is no Campus column or Campus filter;
   - the expand column and "Pays fees" are present;
   - "Admit student" and "Start {year}" are absent.
2. **Given** Chika, **when** she opens `/students/st-femi` (Ikeja), **then** she sees "Student not found" and `GET /students/st-femi` answers 404.
3. **Given** Emeka Obi (teacher), **then**:
   - the list shows only students placed this term in his arms, with the description "Students placed this term in JSS 2 Gold";
   - there is no expand column, no "Pays fees" column and no money column;
   - searching a guardian's phone finds nothing.
4. **Given** Tunde (administrator), **then** the Campus column and the "All campuses" filter appear, and the Active count equals the visible students that are not archived and not Inactive, new intakes included.
5. **Given** a student marked not seen since 7 days ago, **then**:
   - the Active tab shows "Active" and "Not seen 1 wk";
   - the student page shows the warning callout with the inactive-from date, and the profile shows the note;
   - the menu offers "Back in school".
6. **Given** a mark-away date 40 days ago, **when** saved, **then** the warning toast "Over 5 weeks away, so {first} is now Inactive and won’t be billed for new terms." appears and the student moves to the Inactive tab.
7. **Given** a mark-away date tomorrow, **then** the API answers 400 and the toast "Choose a date on or before today." appears.
8. **Given** an Inactive student not seen for 133 days or more, **then**:
   - the Inactive tab shows "Due to be marked Left" and a "Record leaving" button for holders of `student:archive`;
   - the button opens the student page with the leaving dialog;
   - the student page shows the danger callout.
9. **Given** "Reactivate: back in school" on an Inactive student, **then** the toast "{first} is Active again and will be billed from the next charge run." appears and the student is Active.
10. **Given** "Record leaving" with reason Relocated and last day 2 Oct, recorded on 7 Oct, **then**:
    - the enrolment is `withdrawn` and nothing is deleted;
    - the toast "Recorded as left. Nothing was deleted." offers "Left tab";
    - the student appears on Left with "Left on" 2 Oct, the reason and the note, and the profile says "recorded by {name} on 7 Oct";
    - the student's portal login no longer opens the school, and the profile shows "Closed";
    - the menu offers only "Undo leaving…";
    - a second `POST /leave` answers 409.
11. **Given** a leaving recorded this term, **when** "Undo leaving" is confirmed, **then** the student is Active, the enrolment is `active` again, the portal login works again, and the toast reads "{first} is back on the roll." **Given** the term has changed since, **then** the item is absent and `POST /undo-leaving` answers 409.
12. **Given** a JSS 2 student in First term, **when** "Move for next term" to JSS 2 Emerald (Ikeja) is saved by a Lekki-only campus head, **then**:
    - the dialog showed "{first} will no longer appear in your list from Second term.";
    - a Second term placement exists and the First term placement is unchanged;
    - the history card shows both terms;
    - the menu item disappears.
13. **Given** a Third term current, **then** "Move for next term" is not offered, and `POST /placements` answers 409.
14. **Given** First term is current and Ada has only a First term placement, **when** Second term is made current, **then** Ada has a Second term placement in the same class and campus; a withdrawn student gets none.
15. **Given** a member without `student:markAway`, **then** the menu has no mark-away items, and `POST /not-seen` answers 403 for an in-scope student and 404 for an out-of-scope one.
16. **Given** 23 Active students, **then** page 1 shows 10 rows and "Showing 1 to 10 of 23".
17. **Given** a read-only acting super admin, **then** every student is visible, and no Admit, Start or menu items are shown.
18. **Given** a graduate from last year, **then** they appear on Graduated with their final class and school year, and are not visible to a class-scoped teacher.

Start new school year:

19. **Given** Third term 2026/2027 is current and 2027/2028 exists, **when** Tunde opens "Start 2027/2028", **then**:
    - there is one group per current class, for example "JSS 2 Gold (Lekki) → JSS 3 Gold, 32 students" and "SS 3 Blue (Ikeja) → Graduate, 18 students";
    - every listed student is ticked;
    - the footer reads "{a} move up · 0 repeat · {c} graduate" and "Old year's charges stay on Who owes."
20. **Given** that dialog, **when** Tunde unticks Tobi Lawal (JSS 2 Gold) and confirms, **then**:
    - Tobi's row showed "(repeats JSS 2)" and the summary counted 1 repeat;
    - Tobi has a 2027/2028 enrolment at JSS 2 with `is_new_student = false` and a First term 2027/2028 placement in JSS 2 Gold, Lekki;
    - Ada has a 2027/2028 enrolment at JSS 3 and a First term placement in JSS 3 Gold, Lekki;
    - Ada's and Tobi's 2026/2027 enrolments are still `active`, and Third term 2026/2027 is still current, so their class this term is unchanged;
    - the toast reads "2027/2028 started: … moved up, 1 repeating, … graduated. Their new classes show once First term is made current."
21. **Given** that confirmation, **then** each SS 3 Blue student is Graduated with `exit_reason` shown as "Completed SS 3", `graduated_session_id` = 2026/2027, their 2026/2027 enrolment `completed`, no 2027/2028 enrolment, and a closed portal login.
22. **Given** a JSS 2 class whose name has no JSS 3 class on its campus, **then** its group shows "Choose a JSS 3 class", the error "Choose a class for JSS 2 Diamond (Ikeja).", and "Start 2027/2028" is disabled until one is chosen.
23. **Given** the request has succeeded, **when** the same `POST` is sent again, **then** nothing is created and the response has `moved: 0, repeating: 0, graduated: 0` and `skipped` equal to the rows sent. Re-opening the dialog lists only students not yet handled.
24. **Given** a campus head without `student:archive`, **then** final-year groups are listed without checkboxes and with the permission note, the rest can be started, and a `POST` with a `graduate` row answers 403 and writes nothing.
25. **Given** an Inactive JSS 2 student, **then** they are named under their group as not moved and have no 2027/2028 enrolment afterwards; after "Back in school", re-opening the dialog lists only them.
26. **Given** no 2027/2028 school year, **then** "Start {year}" is absent and `GET /students/new-school-year` answers 409.
27. **Given** First term 2027/2028 was made current before the action ran, **then** "Start 2027/2028" is still offered for the students left behind, and their placements are for the current term.

## Tests

- **Unit**
  - api:
    - the lifecycle derivation at the boundaries (day 34 and 35; day 132 and 133), weeks away, effective campus, and the class-scope predicate;
    - the Start new school year planner: target year by current term (S-23), grouping by latest placement, the same-name target class, final-year detection, the repeat class when the current class is archived, and the summary counts.
  - web-admin:
    - tab rendering per state, the column sets per tab and permission, and the empty-state copy;
    - menu item conditions (including Undo leaving) and the callout variants;
    - the dialogs' defaults: mark-away date today − 7; leave reason by state; leave last day from not-seen-since;
    - the Start dialog: ticked by default, "(repeats {level})" on untick, the live summary, the class-required error, locked final-year groups without `student:archive`.
  - Replace both existing `students-page.spec.tsx` cases ("creates a student from the form" goes away). The web-portal `students-page.tsx` is replaced in M2.8.
- **Integration (`api:test-integration`)**
  - Isolation: `student_enrollment` and `enrollment_placement` rows of school B are invisible to and unchangeable by school A. Each route answers 404 across schools.
  - Campus scope by effective campus: a student placed in Ikeja this term with home campus Lekki is invisible to a Lekki-only member.
  - Class scope: the teacher sees only arms they teach or class-teach; the bursar is not class-scoped.
  - Every permission's 403 when in scope; the 409 cases in S-14 to S-19.
  - `DELETE /students/:id` is gone (404/405), and the database refuses to delete a student with an enrolment.
  - Leaving withdraws the enrolment and removes the school membership; undo restores both, and is refused after the term changes.
  - Roll-forward: making a term current copies latest placements for active enrolments of that year only, and never into another year.
  - Start new school year:
    - movers and repeaters get an enrolment with `is_new_student = false` and a first-term placement; graduates get `graduated_session_id` = the year being left and a `completed` enrolment;
    - the year-being-left enrolments of movers and repeaters stay `active`; the current term doesn't change;
    - replaying the same request creates nothing (`UNIQUE (student_id, session_id)` holds);
    - all or nothing: one row with a class at the wrong level leaves every student unchanged;
    - a target year or class from school B answers 404; a student on a campus outside scope answers 404;
    - 403 without `enrollment:place`; 403 for a `graduate` row without `student:archive`;
    - 409 when no target year exists, and when `targetYearId` isn't the target.
- **E2E (required, `eduvault-e2e`)**
  - Administrator: mark not seen since 40 days ago, see Inactive, back in school, record leaving, find the student on Left, undo the leaving.
  - Administrator: move for next term to another campus; the history shows both terms.
  - Administrator: start the next school year with one repeater, make its first term current, and see the movers in their new classes.
  - Bursar: an Ikeja student link answers "Student not found".
  - Teacher: only their class.

## Open decisions

| #      | Question                                                                                                                                                                                                                                                                                                | Options                                                                                                                                                                                                                                                                                                                                                           | Recommendation                                                                                                                                                                                                                                         | Confidence                    | Decided                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| STU-1  | Placements exist per term, but admission and the move action create only one term's placement. When the next term becomes current, every student without a next-term placement has "No class this term", falls back to their home campus, drops out of class scope, and (M3) has no campus for charges. | (a) setting a term current copies each active enrolment's latest placement into the new term, unless one exists; (b) admission and promotion create placements for every remaining term of the session, and "Move" replaces future ones; (c) placement is valid until superseded, so "current placement" means the latest placement on or before the current term | (a). It keeps one row per term as the data model says, it runs in the M2.1 set-current transaction, and "Move for next term" keeps its meaning. (c) is simpler, but it breaks the "term 1 still says Gold" history rule for queries keyed by `term_id` | medium. Touches M2.1 and M3.3 | [D-017](../technical-reference.md#decision-log): (a), within a school year (S-31); across years, D-029    |
| STU-2  | The move dialog lists same-level classes on any campus, including campuses outside the mover's scope. After the move the student leaves the mover's scope.                                                                                                                                              | (a) any campus (prototype and data model); (b) only campuses in the mover's scope; (c) any campus, but a cross-campus move needs `campus:readAll`                                                                                                                                                                                                                 | (a). Transfers between campuses are normal, and a campus head should be able to send a student to another campus. Show a note "{name} will no longer appear in your list from {next term}." when the target campus is outside scope                    | medium                        | Adopted                                                                                                   |
| STU-3  | Default sort on Active and New intakes (the prototype keeps seed order).                                                                                                                                                                                                                                | (a) last name, first name; (b) admission number; (c) class then name                                                                                                                                                                                                                                                                                              | (a)                                                                                                                                                                                                                                                    | high                          | Adopted                                                                                                   |
| STU-4  | Where do paging, search and the tab counts run?                                                                                                                                                                                                                                                         | (a) server-side, as specced; (b) client-side over the full list, as in the prototype                                                                                                                                                                                                                                                                              | (a). Schools reach thousands of students; one query with window counts                                                                                                                                                                                 | high                          | Adopted                                                                                                   |
| STU-5  | Which time zone is "today" for lifecycle dates and date limits?                                                                                                                                                                                                                                         | (a) fixed `Africa/Lagos`; (b) a `school_account.time_zone` column, defaulting to `Africa/Lagos`                                                                                                                                                                                                                                                                   | (b), so schools in other countries can come later, though every current school uses the default. Compute in SQL with `now() AT TIME ZONE`                                                                                                              | medium                        | [D-023](../technical-reference.md#decision-log): (a), Africa/Lagos through one helper; no per-school zone |
| STU-6  | Can a Left student come back, or a leaving recorded by mistake be undone?                                                                                                                                                                                                                               | (a) never (prototype); (b) "Undo leaving" within the same term, with `student:archive`, restoring the enrolment to active; (c) re-admission of the same record into a new enrolment                                                                                                                                                                               | (b) now, (c) later. Without (b), a misclick has no remedy because students cannot be deleted                                                                                                                                                           | low                           | Adopted (S-19; it covers graduations too)                                                                 |
| STU-7  | Recording a leaving after "Move for next term": what happens to the future placement?                                                                                                                                                                                                                   | (a) keep it; the withdrawn enrolment excludes it from charging and rosters; (b) delete the future placement in the same transaction                                                                                                                                                                                                                               | (a). Placements are history, and the enrolment status already excludes them                                                                                                                                                                            | medium                        | Adopted                                                                                                   |
| STU-8  | The Left tab's "Left on" shows the date the leaving was recorded, not the last day attended.                                                                                                                                                                                                            | (a) record date (prototype); (b) last day attended, with the record date on the profile                                                                                                                                                                                                                                                                           | (b). Schools reason about the last day                                                                                                                                                                                                                 | medium                        | Adopted                                                                                                   |
| STU-9  | The not-seen note's hint says "Seen by the bursar and administrators", but the prototype never shows it.                                                                                                                                                                                                | (a) show it on the profile's "Not seen since" row to everyone with `student:read`, and change the hint to "Optional. Shown on the student’s record."; (b) show it only to holders of `student:markAway` or `guardian:read`                                                                                                                                        | (a)                                                                                                                                                                                                                                                    | low                           | Adopted                                                                                                   |
| STU-10 | The prototype writes an activity line for every action, and the leaving note says it appears in "the audit log". The data model has only the super-admin `audit_log`.                                                                                                                                   | (a) a school `activity_event` table (actor, kind, subject, text, campus, time), written in the same transaction, read by the dashboard (M2.6); (b) reuse `audit_log`; (c) skip                                                                                                                                                                                    | (a), owned by M2.6 and specced there, with this slice writing to it. Change the hint to "Shown on the student’s record and in recent activity."                                                                                                        | medium                        | [D-016](../technical-reference.md#decision-log): (a); the table lands with M2.4                           |
| STU-11 | `enrollment:read` gates nothing in the prototype; the history card shows to anyone with `student:read`.                                                                                                                                                                                                 | (a) keep the history under `student:read`, and keep `enrollment:read` for future enrolment reports; (b) hide the history without `enrollment:read`                                                                                                                                                                                                                | (a). The list already shows the class to every reader                                                                                                                                                                                                  | medium                        | Adopted                                                                                                   |
| STU-12 | Which permission gates Start new school year ([D-029](../technical-reference.md#decision-log))? It creates enrolments and placements, and graduates final-year students.                                                                                                                                | (a) `enrollment:place`, plus `student:archive` for a request that graduates anyone; (b) `session:setCurrent`; (c) a new `enrollment:promote`                                                                                                                                                                                                                      | (a). Placing students is what `enrollment:place` already means, and graduating is recording a leaver, so it needs the same permission as Graduate class. (c) would duplicate grading's `promotion` resource                                            | medium                        | Adopted                                                                                                   |

## Prototype gaps noticed

- The Guardians card on the student page and the Active tab's "Pays fees" column ignore `guardian:read`, which the expand column respects. Gate both (S-12).
- The leaving dialog's "still owed" callout shows the balance without any finance permission. Gate it (S-13).
- The New intakes tab's "Paid" column sums every payment the student ever made, not this term's, while its neighbour is "Charged this term". It uses this term's allocations (M3).
- There is no screen for `student:update` (correcting a name or date of birth). The API keeps `PATCH`. A small "Edit details" dialog on the profile card is the obvious follow-up.
- The move dialog's default arm is hard-coded (`a-j2-emerald`).
- The not-seen note is stored but never shown (STU-9).
- A mark-away date before the admission date is accepted. It is rejected here (S-14).
- Active and New intakes have no defined sort (STU-3).
- Lifecycle actions cannot be undone; Undo leaving is added (S-19).
- "Left on" uses the record date (STU-8).
- Placements cover one term only; they roll forward within a year (S-31) and move across years with Start new school year (S-23 to S-30).
- There is no way to move students into a new school year; Start new school year is new ([D-029](../technical-reference.md#decision-log)).
- "GF" in the search placeholder and on numbers is hard-coded; use `school_account.admission_prefix` ([D-019](../technical-reference.md#decision-log)).
- The fee figures and Fees tab depend on M3. Until then the columns, tab and Statement button stay hidden even for holders of `invoice:read`.

## Dependencies

- M1.1: the permission list (`student:markAway`, `student:archive`, `enrollment`, `guardian`), the guard, `/me/permissions` and nav gating; `DELETE /students/:id` and `student:delete` removed ([D-014](../technical-reference.md#decision-log)).
- M2.1: terms, the current term, the next term and making next year's first term current ([D-017](../technical-reference.md#decision-log)). M2.5 adds the roll-forward (S-31) to its make-current transaction.
- M2.2: campuses and `school_setting`.
- M2.3: classes, levels with `next_level_id`, class teachers and `classScope` on `OrgContext`; "Graduate class" on the class page.
- M2.4 together with [41-admission](41-admission.md) and [42-guardians](42-guardians.md), including `activity_event` ([D-016](../technical-reference.md#decision-log)); M2.5 builds on M2.4.
- M2.6: the dashboard students card, the "due to be marked Left" and "not in a class" tasks, and the activity feed.
- M3.3 and M3.4: balances, the Fees tab, the Statement button, and Who owes for leavers. M4.1: subject teachers widen class scope.
- F3 grading: promotion replaces Start new school year ([D-029](../technical-reference.md#decision-log)).
