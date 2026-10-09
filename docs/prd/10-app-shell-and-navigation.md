# PRD: App shell and navigation

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53`
- Milestone and slice: `M0.1` (both shells with placeholder nav), `M1.1` (permission list, guard, `/me/permissions`, nav gating, 401/403/404/409 contract); the bell and nav counts complete in `M3.5`; the portal shell, its pages and the child switcher in `M2.8` (see [roadmap](README.md))
- Related: [01-foundation-design-system.md](01-foundation-design-system.md) (the visual components and tokens the shells are built from, including the [shell pieces](01-foundation-design-system.md#shell-pieces); this PRD owns what the shell shows and when), [permissions-and-custom-roles.md](../brainstorming/permissions-and-custom-roles.md) (Model, API, Folder structure), [data-model-overview.md](../brainstorming/data-model-overview.md) (Rules every table follows, Permission list, Class scope), [ADR 0005](../adr/0005-tenancy.md), [technical reference](../technical-reference.md) decisions [D-001, D-006, D-007, D-012, D-013, D-034, D-035, D-036](../technical-reference.md#decision-log)

## Summary

The shell is the frame around every screen: in `web-admin` a sidebar (school switcher, permission-gated navigation, settings entry, user menu), a topbar (breadcrumb, search and command menu, approvals bell) and the acting banner; in `web-portal` a top bar, a horizontal nav that becomes a bottom nav on phones, and a child switcher for guardians. It also fixes the access contract every screen relies on: a person only sees links, buttons and routes their permissions allow, a route they can't open redirects, out-of-scope records answer 404, and a missing permission answers 403.

## Who uses it

| Persona                                                                     | Permission(s)                                                              | What they can do here                                                                                                                        |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Any staff member (owner, administrator, bursar, teacher, principal, custom) | Their combined permissions from `/me/permissions`                          | See the nav items, settings sections, command-menu entries and bell items their permissions allow; switch school; open "My access"; sign out |
| Member with no roles (Kemi Lawson)                                          | none                                                                       | Sees Dashboard ("No access yet") and Approvals (own leave only); nothing else                                                                |
| Super admin, not acting (Jude)                                              | platform role `superadmin`                                                 | Platform console shell: Schools, Audit log. No bell, no settings                                                                             |
| Super admin, acting in a school                                             | Every `read`/`readAll` action, all campuses; with a reason, all            | The school's `web-admin` shell with the acting banner and badge                                                                              |
| Student (Ada Okeke)                                                         | `student:readOwn`, `feeLine:readOwn`, `invoice:readOwn`, `payment:readOwn` | Portal shell: Home, Fees, Purchases                                                                                                          |
| Guardian (Ngozi Okeke)                                                      | as student, over linked children                                           | Portal shell: My children, Home, Fees, Purchases, plus the child switcher                                                                    |

Scopes applied: campus scope (`campus:readAll` or the member's campuses), class scope (binds only `class:read` without `class:readAll`), student scope (own record, or a guardian's linked children). Out-of-scope rows answer 404; in scope without the permission answers 403 [tenancy-001].

## Screens

### web-admin shell (staff and acting super admin)

- App: `web-admin` (:4200). Root layout for every route except the platform console's own head (below), sign-in and set-up (see [11](11-sign-in-and-setup.md)).
- Layout, desktop (wider than 820px): a left sidebar 16rem wide, then the inset column: the acting banner (only while acting), the sticky topbar (52px), and the main area.
- Sidebar, top to bottom: school switcher (head), navigation (body, scrolls), user menu (foot).

#### Navigation: groups, order, gates

Groups appear in this order. Inside a group, items sort by nav order, then by the order below. An item whose gate fails is **not rendered**. A group with no visible items is not rendered. Labels are the nav title where it differs from the page title.

| Group    | Nav label         | Page title        | Route                            | Gate (any of)                       | Phase | Icon               | Count shown                                              | Slice that adds it    |
| -------- | ----------------- | ----------------- | -------------------------------- | ----------------------------------- | ----- | ------------------ | -------------------------------------------------------- | --------------------- |
| Overview | Dashboard         | Dashboard         | `/`                              | signed in (none)                    | F0    | `layout-dashboard` | –                                                        | M2.6 (M0.1 stub)      |
| Overview | Approvals         | Approvals         | `/approvals`                     | signed in (none)                    | F1    | `inbox`            | every approval item the person can act on                | M3.5                  |
| Overview | Announcements     | Announcements     | `/announcements`                 | `announcement:read`                 | F1    | `megaphone`        | –                                                        | M2.7                  |
| People   | Students          | Students          | `/students`                      | `student:read`                      | F0    | `graduation-cap`   | –                                                        | M2.4                  |
| People   | Staff and members | Staff and members | `/members`                       | `member:read`                       | P1    | `users`            | –                                                        | M1.3                  |
| School   | Classes           | Classes           | `/classes`                       | `class:read`                        | F0    | `school`           | –                                                        | M2.3                  |
| School   | Subjects          | Subjects          | `/subjects`                      | `subject:read`                      | F2    | `book-marked`      | –                                                        | M4.1                  |
| Finance  | Fees              | Who owes          | `/finance/accounts`              | `invoice:read` or `payment:read`    | F1    | `wallet`           | –                                                        | M3.2–M3.4             |
| Finance  | Payments          | Payments          | `/finance/payments`              | `payment:read`                      | F1    | `banknote`         | waiting corrections, discounts and payment cancellations | M3.4                  |
| Finance  | Store             | Store             | `/finance/store`                 | `store:read`                        | F2    | `store`            | waiting store write-offs                                 | M4.3                  |
| Finance  | Accounts          | Money accounts    | `/finance/money-accounts`        | `moneyAccount:read`                 | F1    | `landmark`         | –                                                        | M3.1                  |
| (none)   | Settings          | (first section)   | first permitted settings section | any settings section passes (below) | F0    | `settings`         | –                                                        | M2.2 (M1.4 for Roles) |

- Roles, Campuses, School years and terms, Payment rules and the school profile are **settings sections**, not nav items ([D-035](../technical-reference.md#decision-log)). The school's own settings pages live under `/settings/*`; `/roles`, `/campuses` and `/calendar` keep their paths but sit under the Settings entry. This differs from the folder tree in the permissions doc, which puts `routes/roles/` at the top level.
- The Settings entry sits alone at the bottom of the nav, in its own unlabelled group.
- Detail pages are not nav items. They mark their parent active: Student → Students, Member → Staff and members, Class → Classes, Role → Settings, Charge (invoice) → Fees. The finance sub-pages mark their nav root active: Charge students, Charges, School fees, Other fees → Fees; Discounts and refunds → Payments; Money categories → Accounts.
- The active item carries `aria-current="page"`.
- Each group label is a button that collapses or expands its group (`aria-expanded`). Collapsing does nothing in the rail.

#### Counts on nav items

- A count badge appears only when the number is above zero.
- Approvals shows the number of approval items the person can act on (holds the item's permission, item in campus scope or school-wide).
- Payments shows the waiting corrections, discounts and payment cancellations; Store shows waiting store write-offs. These are also included in the Approvals count. The overlap is intended: the count signposts where to act.
- Counts exclude the person's own requests, matching the bell ([D-036](../technical-reference.md#decision-log)).

#### Collapsed rail

- The topbar's "Toggle sidebar" button (`panel-left`, desktop only) or ⌘B / Ctrl+B collapses the sidebar to a 3.25rem icon rail and back. Tooltip: "Collapse sidebar ⌘B" or "Expand sidebar ⌘B".
- In the rail: labels, counts, group labels and the switcher text are hidden; each group label becomes a thin divider; every nav icon shows a tooltip with its label and, when there is one, the count as "Approvals (3)"; the school switcher's tooltip is the school name; the user button's tooltip is the person's name.

#### School switcher (sidebar head)

- Button: the school crest (logo, or the school's initials when there is no logo), the school name in bold, and below it "{current term name} · {school year}" (for example "First term · 2026/2027"). A `chevrons-up-down` icon. Opens a menu aligned left.
- Menu, in order:
  1. Heading "School", then the schools the person belongs to, the active one ticked. Choosing another school switches the active school (see Business rules 7).
  2. Separator, heading "Campuses (you see all)" when campus scope is all, otherwise "Your campuses"; one item per campus in scope (`map-pin`). With `team:read` each opens Campuses; without it the items are plain text.
  3. Separator, "School years and terms" (`calendar-days`), shown only with `session:read`, opens `/calendar`.
- Platform console: the head is not a menu. It shows a shield crest, "Eduvault platform" and "Super admin console".

#### User menu (sidebar foot)

- Button: avatar, the person's name, and below it their role labels joined with ", " (the `member` role is never listed), or "Member, no roles" when they hold none; "superadmin" for a super admin. Opens upward.
- Menu, in order: a header (avatar, name, email); separator; "My access" (`key-round`; not shown to a super admin); "Command menu" with shortcut "⌘K"; "Light or dark" (`sun-moon`); separator; "Sign out" (`log-out`).
- "Sign out" ends the session and returns to the sign-in screen. Because session cookies are host-scoped, it also signs the person out of `web-portal`.

#### My access sheet

- Opened from "My access" (and from the no-roles Dashboard's "See my access"). A side sheet titled "My access", description "What you can do in {school name}, and why."
- Body: large avatar, name, their staff title; then a key/value list: "Roles" (a badge per role, "—" when none), "Campuses" ("Every campus" or the campus names), "Classes" ("Every class", "{class names} (classes they teach)", or "No classes assigned yet").
- "What you can do": one line per thing their permissions allow, in the plain words of the role editor's areas (for example "Payments: record payments and give receipts", "Approves refunds, discounts and cancellations"). The wording comes from `CAP_AREAS` in `libs/policy`, which ships in M1.1 ([02](02-foundation-permissions-and-scopes.md#the-plain-language-model-cap_areas)). Empty: "Nothing yet. Ask the owner to give you a role."

#### Topbar

Left to right:

1. Mobile only: "Open navigation" (`menu`) button.
2. Desktop only: the rail toggle, then a vertical separator.
3. Breadcrumb (`aria-label="Breadcrumb"`): the group name (desktop only), `›`, the parent nav item as a link when on a detail or sub-page, `›`, the current page title. A page can supply its own trail instead (for example "Schools › Greenfield College" in the platform console, or the settings section name such as "School profile"). Every crumb but the last is a link.
4. The acting badge, while acting: warning badge with an eye icon, "Acting · read-only" or "Acting · writes on".
5. Spacer.
6. Search button: `search` icon, "Search…" and the ⌘K hint; `aria-label="Search pages and actions"`. On phones it shrinks to the icon.
7. Approvals bell (below). Not shown to a super admin who is not acting.

There is no theme button in the topbar; the theme switch is in the user menu.

#### Command menu

- Opens from the search button, the user menu's "Command menu", or ⌘K / Ctrl+K (which also closes it). Esc closes it.
- Input placeholder "Search pages and actions…". People search is not part of the command menu; it comes later as its own slice (S-9). Footer hints: "↑ ↓ move", "↵ open", "Esc close". The dialog itself is `CommandDialog` ([01](01-foundation-design-system.md#overlays)).
- Groups:
  - **Pages**: every nav page the person can open in the current app, label = page title, hint = nav group, icon = the nav icon. The nav label is also matched, so "Fees" finds "Who owes".
  - **Settings**: every settings section the person can open (the Settings frame table below), label = section name, hint "Settings", icon `settings` (S-10).
  - **Actions**: quick actions the person holds the permission for. Each is registered by the slice that builds its screen:

    | Label                | Permission          | Opens                                        | Hint    | Slice |
    | -------------------- | ------------------- | -------------------------------------------- | ------- | ----- |
    | Admit a student      | `student:create`    | Students, with the admission dialog open     | People  | M2.4  |
    | Add a staff member   | `member:create`     | Staff and members, with the add dialog open  | People  | M1.3  |
    | Create a custom role | `ac:create`         | the role editor for a new role               | Roles   | M1.4  |
    | Record a payment     | `payment:record`    | Payments, with the record dialog open        | Finance | M3.4  |
    | Charge students      | `invoice:bill`      | Charge students, with the new round open     | Finance | M3.3  |
    | Discount or refund   | `adjustment:create` | Discounts and refunds, with the request open | Finance | M3.5  |
    | Add a fee we charge  | `feeLine:create`    | School fees, with the add dialog open        | Finance | M3.2  |
    | See who owes fees    | `invoice:read`      | Who owes                                     | Fees    | M3.4  |

- Groups appear in the order Pages, Settings, Actions.
- Filtering: case-insensitive; every word typed must appear in the item's label, hint or group. Groups with no match hide. The first match is selected; ↑/↓ move the selection (wrapping), ↵ opens it. No match: "No results."
- The platform console's command menu lists Schools and Audit log; it has no actions.

#### Approvals bell

- Icon button (`bell`), screen-reader label "Approvals". Tooltip "{n} waiting for your approval", or "Approvals" when none. A count badge on the icon when n > 0.
- Feed: approval items waiting (status submitted) that the person can act on, **not** created by them, and in their campus scope (items with no campus are visible to every approver). Kinds and their labels: "Reduce a fee", "Cancel a balance", "Refund" (adjustments), "Cancel a payment" (payment cancellations), "Discount", "Store write-off" (stock counts), all needing `adjustment:approve`; "Leave", needing `leave:approve`.
- Popover: heading "Waiting for you"; when n > 0 a small "Open approvals" link to `/approvals`. Up to five items, each showing the kind, a one-line title (for example "Ada Okeke: sibling discount (5%)") and the amount when there is one; clicking an item opens its screen (Discounts and refunds, Store, or Approvals for leave). Empty: "All clear" / "Nothing is waiting for your approval."
- The bell is not a general notifications centre: it shows nothing but approval items.

#### Settings frame

- Every settings section renders inside a two-column frame: a settings nav on the left, the section on the right.
- Settings nav groups and sections, each shown only if its gate passes:

  | Group            | Section                | Route                     | Gate                  |
  | ---------------- | ---------------------- | ------------------------- | --------------------- |
  | General          | School profile         | `/settings/profile`       | `schoolAccount:read`  |
  | General          | Admissions rules       | `/settings/admissions`    | `schoolAccount:read`  |
  | General          | Approval rules         | `/settings/approvals`     | `schoolAccount:read`  |
  | School structure | School years and terms | `/calendar`               | `session:read`        |
  | School structure | Campuses               | `/campuses`               | `team:read`           |
  | Finance          | Payment rules          | `/settings/payment-rules` | `schoolAccount:read`  |
  | Access           | Roles and permissions  | `/roles`                  | `ac:read`             |
  | Access           | Danger zone            | `/settings/danger`        | `organization:delete` |

- The sidebar's Settings entry opens the first section the person can open and is active on any settings route (including a role's page).
- On phones the settings nav becomes a select labelled "Settings section", grouped by the headings above; with no current section it shows "Choose a section".
- Without `schoolAccount:read`, `/settings` shows title "Settings", description "The parts of the school set-up you can open.", and a "Your settings" list linking each section they can open; breadcrumb "All sections".
- Danger zone without `organization:delete`: title "Danger zone", description "Only the owner can open this page.", warning callout "Handing over or deleting the school is limited to the owner." Section contents belong to M2.2.

#### Finance sub-tabs

- Finance pages show a row of tabs above the page, one per sub-page the person can open; a tab whose page gate fails is not shown.
  - Fees: Who owes, Charge students, Charges, School fees, Other fees.
  - Payments: Payments, Discounts and refunds.
  - Accounts: Money accounts, Money categories.
- Store has no sub-tabs. Page contents belong to M3.

#### Mobile (820px and narrower)

- The sidebar is hidden. "Open navigation" opens the same sidebar (switcher, nav, user menu) in a sheet from the left. Choosing a link closes it.
- No rail on phones. The breadcrumb drops the group name. The search button is icon-only. The main area keeps 72px of bottom padding.
- `web-admin` has no bottom nav.

#### Shared chrome

- **Toasts**: the `Toaster` component ([01](01-foundation-design-system.md#feedback)); every write reports its outcome through one.
- **Not found page**: title "{Kind} not found"; empty state "We couldn’t find that {kind}" / "It may have been moved, or it may belong to a campus or class you don’t look after." with "Go back", which opens the parent nav page (or the default page).
- **Render failure**: the main area shows the error through `ErrorMessage`; the shell stays usable.
- **Loading**: the shell renders at once; the main area shows skeletons until the route's loader resolves.
- **Tables** page with `TablePager` ([01](01-foundation-design-system.md#navigation-within-a-page)).

### Platform console shell (super admin, not acting)

- Same `web-admin` shell at `/platform/*`. Head: shield crest, "Eduvault platform", "Super admin console" (not a menu).
- One nav group, "Platform": Schools (`/platform/schools`, `school`, P2) and Audit log (`/platform/audit`, `history`, P3). School detail (`/platform/schools/$schoolId`) marks Schools active.
- No Settings entry, no bell. User menu sub-line "superadmin", header email shown as the super admin's email; no "My access".
- Screens are specified in [12](12-platform-console.md).

### web-portal shell (students and guardians)

- App: `web-portal` (:4201). Root layout for every portal route.
- Top bar: the school crest and school name on the left. On the right, for a guardian on desktop, the child switcher; then the user menu (avatar, name on desktop, chevron).
- User menu: a header with the name and the username or email; separator; for a guardian or student who belongs to more than one school, a "School" heading listing those schools, the active one ticked, where choosing one switches the active school as in Business rules 7 (S-14), then a separator; "Light or dark"; separator; "Sign out".
- Desktop: a centred horizontal nav under the top bar, icon and label per item, the current item highlighted.
- Phones (820px and narrower): the horizontal nav is hidden; a fixed bottom nav shows one button per item with a large icon and a short label ("My children" becomes "Children").
- Nav items, in order, each shown only when its gate passes and it applies to the person:

  | Label       | Route        | Gate              | Shown to            | Icon            |
  | ----------- | ------------ | ----------------- | ------------------- | --------------- |
  | My children | `/children`  | `student:readOwn` | guardians only      | `users-round`   |
  | Home        | `/`          | `student:readOwn` | students, guardians | `house`         |
  | Fees        | `/fees`      | `invoice:readOwn` | students, guardians | `wallet`        |
  | Purchases   | `/purchases` | `invoice:readOwn` | students, guardians | `shopping-cart` |

- Default page: a guardian lands on My children, a student on Home.
- No breadcrumb, no search, no command menu (⌘K does nothing) and no bell in the portal (S-17).

#### Child switcher (guardians)

- A group of chips labelled "Viewing child", one per linked child: avatar and first name, the selected one pressed (`aria-pressed`).
- Desktop: in the top bar. Phones: at the top of the main area, scrolling sideways, on every page except My children.
- The selected child is held in a `child` search parameter, so it survives a reload and the back button (S-15). With none, the first linked child is selected. If the selected child is no longer linked, the selection falls back to the first.
- Home, Fees and Purchases show the selected child. On My children, "See fees" on a child's card selects that child and opens Fees.

### States worth seeing

#### 1. Out of campus scope → 404

- Chika Eze (bursar, Lekki campus) follows a link to Femi, a student on the Ikeja campus.
- The API answers 404 for `GET /students/{femi}`, the same body as for an id that doesn't exist.
- The page shows the not-found page: "Student not found", "We couldn’t find that student", "It may have been moved, or it may belong to a campus or class you don’t look after.", "Go back" (opens Students). The breadcrumb reads "People › Students › Student".
- The same applies to members, roles, classes and schools (platform), and to any row outside the school, campus, class or student scope.

#### 2. Route guard redirect when a permission is missing

- Emeka Obi (teacher, no `feeLine:read`) opens `/finance/school-fees` from a bookmark or typed URL.
- The route's guard fails, so the app redirects to his default page (Dashboard) without a message. The Fees nav item and the School fees tab were never shown to him.
- If he called the API directly he would get 403 (`code: "Forbidden"`).

#### 3. Member with no roles

- Kemi Lawson was added to the school and holds only `member`.
- `/me/permissions` returns no permissions. The nav shows only Dashboard and Approvals; no Settings entry; the user menu reads "Member, no roles".
- Dashboard: title "Welcome, Kemi", description "{school name} · {term name} {school year}", and an empty state "No access yet" / "You’re on the staff list, but you can’t see anything until the owner gives you a role. This page fills in once they do." with "See my access", which opens the My access sheet ("Nothing yet. Ask the owner to give you a role.").
- Approvals shows only the leave view ("Ask for leave and see what the school decides.", "Request leave"). The bell shows "All clear". The command menu lists Dashboard and Approvals only.
- Every gated API route answers 403.

#### 4. Self-approval refused

- Someone with `adjustment:approve` opens Approvals and sees a request they created (for example a payment cancellation they drafted).
- Their own row shows a "Your own" warning badge instead of Approve and Decline. Tooltip: "You created this. Someone else must approve it." (The prototype's tooltip names the database check; see Prototype gaps.)
- Their own requests are left out of the bell and of the nav counts.
- If an approve or decline call is made anyway, the API answers 409 with `code: "SelfApproval"`, and the screen shows a danger toast with the same sentence. The database checks `approved_by <> created_by` and `rejected_by <> created_by` back this up ([D-013](../technical-reference.md#decision-log), [D-025](../technical-reference.md#decision-log)).
- The requester can still withdraw their own submitted leave.

#### 5. Super admin acting read-only

- Jude (super admin) starts acting in Greenfield College from the platform console.
- The school's `web-admin` shell opens on Dashboard. Above the topbar, the acting banner (`role="status"`): eye icon, "Acting in Greenfield College", "Read-only. Every request is audited.", a reason field (placeholder "Reason, e.g. SUP-2214", required, label "Reason for writes"), "Allow writes", and "Leave school" (`log-out`). The topbar shows "Acting · read-only".
- Permissions are every `read` and `readAll` action, all campuses and classes. Every button or menu item that needs another permission is hidden, as for anyone lacking it.
- Submitting a reason: toast "Writes allowed. Each one is audited with your reason." The banner then reads "Writes allowed. Reason {reason}" with "Back to read-only"; the badge reads "Acting · writes on"; permissions become all permissions.
- Any write sent without a reason answers 403 (`code: "ActingReadOnly"`) and is audited with that status.
- "Leave school" ends acting and returns to that school's page in the platform console. Details in [12](12-platform-console.md).

## Business rules

1. The SPA reads the person's combined permissions, campus scope, class scope and acting state from `GET /me/permissions`. It never computes the union from role definitions on the client (Better Auth's client check only knows code roles; permissions doc, gap 3).
2. A nav item, settings section, finance sub-tab, command-menu entry, button or menu item whose permission the person lacks is not rendered. A menu whose items are all hidden is not rendered. A nav group with no visible items is not rendered.
3. Each gated route's `beforeLoad` calls `can(context.permissions, resource, action)`; a gate may list several pairs and passes when any one is held ([D-012](../technical-reference.md#decision-log)). On failure it redirects to the default page, without a toast (S-5): links are hidden, so only stale bookmarks hit it.
4. The default page in `web-admin` is the first nav item the person passes, which is always Dashboard. In the platform console it is Schools. In the portal it is My children for a guardian and Home for a student.
5. Out-of-scope rows (another school, another campus, a class outside class scope, a student outside student scope) answer 404 with the same body as a missing id. In-scope requests without the permission answer 403. The permission check runs in the guard, before any row is loaded.
6. A request whose approver is its creator answers 409 `SelfApproval` ([D-013](../technical-reference.md#decision-log)). The service checks before writing; the database `CHECK (approved_by <> created_by)` (and `rejected_by <> created_by`) is the backstop, and `ErrorFilter` maps its violation (`23514`) to the same 409.
7. Choosing another school in the switcher calls `setActive`, invalidates every cached query, refetches `/me/permissions` and opens Dashboard.
8. Nav counts and the bell use the same feed: waiting items the person can act on, in campus scope, not created by them.
9. A super admin who is not acting sees only the platform console. A super admin acting in a school sees that school's `web-admin` shell; their permissions come from the acting rules ([12](12-platform-console.md)), not from membership.
10. The portal shell shows to people who hold a portal permission (`readOwn`) in the active school, including staff who are also guardians ([02](02-foundation-permissions-and-scopes.md#staff-who-are-also-guardians)). A staff session with no portal permission opening `web-portal` sees a screen reading "This portal is for students and guardians. Staff use web-admin." with a link to `web-admin` and "Sign out"; a portal-only account opening `web-admin` sees "Students and guardians use the portal." with a link to `web-portal` and "Sign out" (S-13). Session cookies are host-scoped, so both cases happen.
11. A guardian's selected child is always one of their linked children; the API still filters by student scope, so a stale selection cannot reveal another child.
12. The rail, collapsed nav groups and the theme are per-browser preferences, kept in `localStorage`, read inside `try/catch`, and default to expanded, all groups open, and the system theme.
13. Nav items, settings sections and command-menu actions arrive with the slice that builds their screen; an unbuilt screen has no nav item.
14. `/me/permissions` is cached with a 60-second `staleTime`, refetched when the window regains focus, after the person's own role or school changes, and after any 403 ([D-034](../technical-reference.md#decision-log), S-7).
15. When a route's API call answers 403, the client refetches `/me/permissions` and re-runs the route's guard: if the guard now fails it redirects to the default page; otherwise the main area shows `ErrorMessage` ([D-034](../technical-reference.md#decision-log), S-6).
16. `/approvals/counts` is refetched every 60 seconds and on focus, and every approval mutation invalidates it (S-8).
17. While a super admin acts read-only, every control that needs a write permission is hidden, as for anyone lacking it; the banner explains why (S-12).
18. A campus item in the school switcher opens Campuses; it does not narrow lists. Lists show every campus in the person's scope, and the active campus (`activeTeamId`) is only the default campus on create forms (S-2).

## Data

- No new tables for the shell.
- `/me/permissions` reads `member.role` (comma list), the matching `organizationRole` rows, `teamMember` for campus scope, and `class_arm_teacher` plus the subject-teacher table for class scope (from M2.3 and M4.1). See the permissions doc's Guard section and the overview's [Class scope](../brainstorming/data-model-overview.md#class-scope).
- The bell and nav counts read the approval-carrying tables of the finance and leave modules (`adjustment`, payment cancellations, `discount`, stock counts, `staff_leave`); see [data-model-finance.md](../brainstorming/data-model-finance.md) and the overview's `staff_leave`.
- Permission list: replace `libs/policy` `statements.ts` with the prototype's list (the overview's [Permission list](../brainstorming/data-model-overview.md#permission-list) plus the permissions doc's phase 1). Each resource still joins the list with the slice that adds its endpoints.

## API

| Method | Path                | Permission                                      | Request                                                              | Response                                                                                                                                                                                           | Errors                                                                                                                                                    |
| ------ | ------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/me/permissions`   | signed in; active school, or acting super admin | Optional headers `X-Eduvault-Acting-Org`, `X-Eduvault-Acting-Reason` | `{ organizationId, roles: string[], permissions: Record<resource, action[]>, campusScope: 'all' \| string[], classScope: 'all' \| string[], acting: null \| { organizationId, writes: boolean } }` | 401 no session; 403 `NoSchool` (no active school, not acting); 403 `MustChangePassword`; 403 `SchoolSuspended`; 404 acting header names an unknown school |
| GET    | `/me`               | signed in (exists)                              | –                                                                    | adds `mustChangePassword: boolean`, `platformRole: 'superadmin' \| null`, `schoolCount: number`                                                                                                    | 401                                                                                                                                                       |
| GET    | `/approvals/counts` | signed in; active school (M3.5)                 | –                                                                    | `{ total, byNav: { approvals, payments, store }, latest: ApprovalItem[] }` (`latest` capped at 5; own and out-of-scope items excluded)                                                             | 401; 403 `NoSchool`                                                                                                                                       |

- Switching school uses Better Auth's `organization.setActive`; listing schools uses `organization.list`.
- Error bodies follow `ApiErrorBody` (`{ code, message, issues? }`). The shared contract: 401 `Unauthorized`; 403 `Forbidden` (missing permission), `NoSchool`, `MustChangePassword`, `SchoolSuspended`, `ActingReadOnly`; 404 `NotFound` (missing or out of scope, identical); 409 `Conflict`, `SelfApproval`.
- Contract types (`MePermissions`, `ApprovalCounts`, the error codes) live in `@eduvault/api-contract`.

## Acceptance criteria

- Given a bursar on Lekki, when they request an Ikeja student by id, then the API answers 404 with the same body as a random id, and the page shows "Student not found".
- Given a teacher without `feeLine:read`, when they open `/finance/school-fees`, then they land on Dashboard with no toast, and the Fees nav item is not in the DOM.
- Given a teacher without `feeLine:read`, when they call `GET /fee-lines`, then the API answers 403 `Forbidden`.
- Given a member with no roles, when they sign in, then the nav shows only Dashboard and Approvals, Dashboard shows "No access yet", and the user menu reads "Member, no roles".
- Given a member with no roles, when they call any gated route, then the API answers 403.
- Given an approver viewing their own request, when the Approvals list renders, then the row shows "Your own" and no Approve or Decline button, and the request is not in the bell or the nav counts.
- Given an approver, when they call approve on their own request, then the API answers 409 `SelfApproval` and nothing changes.
- Given a super admin acting without a reason, when the shell renders, then the banner reads "Read-only. Every request is audited." and no write button is rendered; when they send a write, then the API answers 403 `ActingReadOnly`.
- Given a person holding `payment:read` but not `invoice:read`, when they open Fees, then the Who owes tab shows (its gate is either permission) and Charges does not.
- Given a person holding only `session:read` among settings permissions, when they click Settings, then School years and terms opens, and the settings nav lists only that section.
- Given a person with two schools, when they pick the other school in the switcher, then every query refetches and Dashboard opens for the new school.
- Given a guardian with three children, when they pick a child chip, then Home, Fees and Purchases show that child, and on phones the chips appear above the content on every page except My children.
- Given a student, when the portal renders, then the nav shows Home, Fees and Purchases, not My children.
- Given the rail is collapsed, when the person hovers Approvals, then the tooltip reads "Approvals (n)".
- Given the command menu is open, when the person types "fees", then Who owes appears under Pages and only actions they hold appear under Actions; when nothing matches, "No results." shows.
- Given 820px width, when the person taps "Open navigation", then the sidebar opens in a left sheet and closes after they choose a link.
- Given a person holding `team:read`, when they type "campuses" in the command menu, then Campuses appears under Settings.
- Given a guardian who picked their second child, when they reload Fees, then the second child is still selected (the `child` search parameter).
- Given a staff session with no portal permission, when it opens `web-portal`, then it sees "This portal is for students and guardians. Staff use web-admin." and no portal nav.
- Given a member whose role loses `payment:read` while Payments is open, when the next Payments call answers 403, then `/me/permissions` is refetched and the person lands on Dashboard.

## Tests

- Unit (`nx run libs-policy:test`, `nx run web-admin:test`, `nx run web-portal:test`):
  - `can()` over a resolved permission map, including any-of gates.
  - Nav model: given a permission map, the visible groups, items, order, active item for detail pages, and counts.
  - Settings model: visible sections and the first section for the Settings entry.
  - Command-menu filter: word matching, nav-label keywords, the Settings group, empty state.
  - Shell render with `renderWithApi` and a fake permission map: no-roles member, teacher, bursar, acting super admin (read-only and writes), guardian and student portal nav.
  - Route `beforeLoad` redirect when `can` fails.
- Integration (`api:test-integration`):
  - `GET /me/permissions` returns the union of several roles, `campusScope` from `teamMember` or `campus:readAll`, and `classScope` as defined; empty for a no-roles member; 403 `NoSchool` without an active school.
  - The 403/404 contract on one representative route per existing module: another school's row → 404; another campus's row → 404; missing permission → 403; no-roles member → 403 everywhere.
  - Acting headers on `/me/permissions`: honoured for `superadmin`, ignored for everyone else, 404 for an unknown school.
  - `ErrorFilter` maps a `23514` check violation to 409 (`error.filter.spec.ts` unit case too).
  - With M3.5: `/approvals/counts` excludes own and out-of-scope items.
- E2E (opt-in, `eduvault-e2e`): sign in as each persona and check the visible nav; the teacher's redirect from `/finance/school-fees`; the bursar's 404 on an Ikeja student; rail toggle and the mobile sheet; school switch with two schools.

## Open decisions

| #    | Question                                                                                           | Options                                                                                                                                                                                              | Recommendation                                                                                                      | Confidence                                                    | Decided                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| S-1  | Does the sidebar head switch between schools?                                                      | (a) single school as in the prototype; (b) list every school the person belongs to and `setActive`                                                                                                   | (b): CONTEXT says a user can belong to many schools and today's `ContextSwitchers` already does it                  | High: the prototype only seeds one school                     | Adopted                                                                                       |
| S-2  | What does the active campus (`activeTeamId`) mean once reads filter by campus scope?               | (a) campus items set the active campus and narrow every list; (b) campus items only open Campuses; the active campus is a default for create forms                                                   | (b): matches the prototype, where lists show every campus in scope                                                  | Medium: create forms may want an explicit campus field anyway | Adopted                                                                                       |
| S-3  | Persist the rail and collapsed groups?                                                             | (a) in memory; (b) `localStorage`                                                                                                                                                                    | (b)                                                                                                                 | High: standard sidebar behaviour                              | Adopted                                                                                       |
| S-4  | Persist the theme?                                                                                 | (a) not persisted; (b) `localStorage`, default system                                                                                                                                                | (b)                                                                                                                 | High                                                          | Adopted                                                                                       |
| S-5  | Tell the person why a route redirected?                                                            | (a) silent; (b) toast "You don’t have access to that page."                                                                                                                                          | (a), as the prototype does: links are hidden, so only stale bookmarks hit it                                        | Medium                                                        | Adopted                                                                                       |
| S-6  | A route's API call answers 403 because permissions changed mid-session                             | (a) show `ErrorMessage`; (b) refetch `/me/permissions`, re-run the guard, redirect if it now fails, else `ErrorMessage`                                                                              | (b)                                                                                                                 | Medium                                                        | [D-034](../technical-reference.md#decision-log): refetch after any 403, then re-run the guard |
| S-7  | How fresh is `/me/permissions`?                                                                    | (a) once per page load; (b) `staleTime` 60 s, refetch on focus and after the person's own role or school changes                                                                                     | (b)                                                                                                                 | Medium                                                        | [D-034](../technical-reference.md#decision-log): refetch on focus and after any 403           |
| S-8  | How do the bell and nav counts stay current?                                                       | (a) on navigation only; (b) `/approvals/counts` refetched every 60 s and on focus, invalidated by approval mutations                                                                                 | (b)                                                                                                                 | Medium                                                        | Adopted                                                                                       |
| S-9  | The command menu's placeholder promises "people", but nothing searches people                      | (a) add student and staff search; (b) defer and say "Search pages and actions…"                                                                                                                      | (b) for M0.1; people search later as its own slice                                                                  | Medium                                                        | Adopted                                                                                       |
| S-10 | Do settings sections appear in the command menu?                                                   | (a) no, as in the prototype; (b) yes, in a "Settings" group                                                                                                                                          | (b): settings are otherwise two clicks deep                                                                         | Low: a deviation from the prototype                           | Adopted                                                                                       |
| S-11 | Can a member with no roles request leave?                                                          | (a) yes, as the prototype shows; (b) no, "can do nothing" (CONTEXT)                                                                                                                                  | (a): a person's own leave needs no permission; reword CONTEXT's "can do nothing" to "can see nothing of the school" | Medium                                                        | Adopted                                                                                       |
| S-12 | Write controls while acting read-only                                                              | (a) hidden, like any missing permission; (b) shown disabled with "Read-only. Add a reason in the banner to make changes."                                                                            | (a): one rule everywhere; the banner explains                                                                       | Medium: support staff may look for a missing button           | Adopted                                                                                       |
| S-13 | A staff session on `web-portal`, or a portal-only account on `web-admin` (cookies are host-scoped) | (a) let them in with an empty nav; (b) a screen: portal "This portal is for students and guardians. Staff use web-admin." with a link and "Sign out"; admin "Students and guardians use the portal." | (b)                                                                                                                 | Medium                                                        | Adopted                                                                                       |
| S-14 | A guardian whose children are at two schools                                                       | (a) one school per sign-in; (b) a school picker in the portal user menu                                                                                                                              | (b) when they belong to more than one school                                                                        | Low: no pilot data on this                                    | Adopted                                                                                       |
| S-15 | Where does the selected child live?                                                                | (a) memory; (b) `sessionStorage`; (c) a `child` search param                                                                                                                                         | (c): survives reload and back, and the API re-checks scope                                                          | Medium                                                        | Adopted                                                                                       |
| S-16 | Status for self-approval                                                                           | (a) 403; (b) 409 `SelfApproval`                                                                                                                                                                      | (b), as the prototype's request trace answers                                                                       | High                                                          | [D-013](../technical-reference.md#decision-log): 409 `SelfApproval`                           |
| S-17 | Does the portal get a command menu?                                                                | (a) yes; (b) no                                                                                                                                                                                      | (b): the portal has four pages                                                                                      | High                                                          | Adopted                                                                                       |

## Prototype gaps noticed

- Nav counts include the person's own requests, while the bell excludes them. This spec excludes them in both.
- The "Self-approval refused" state uses Chika (bursar), who doesn't hold `adjustment:approve`, so she sees the leave-only Approvals page and never the "Your own" badge. The behaviour is specified as it would be for an approver.
- The "Your own" tooltip and toast read "You created this. The database refuses approved_by = created_by, so someone else must approve it." That is developer wording; this spec uses "You created this. Someone else must approve it."
- The school crest in the sidebar head is hardcoded "GC"; the settings profile uses the logo or initials.
- Campus items in the switcher open Campuses even for people without `team:read`, who would be redirected.
- The bell's list items always use the wallet icon, including leave.
- The command menu matches page titles only, so "Fees" doesn't find "Who owes" by its nav label; settings sections are missing from it.
- The portal nav filters by persona kind only, not by permission.
- ⌘K opens the command menu in the portal, which has no search button.
- The finance-tabs comment mentions a Store tab; Store has no sub-tabs.
- "Sign out" is a stub toast; the theme isn't persisted.
- The My access sheet says "What this person can do"; its footer opens the Access lab (prototype tooling).
- The acting-read-only reason ("Acting read-only. A write needs a reason (X-Eduvault-Acting-Reason).") only shows in the prototype's reveal mode.

## Dependencies

- M0.1 design system: `libs/ui` already has sidebar, sheet, dropdown-menu, popover, tooltip, breadcrumb, badge, avatar, tabs, select, skeleton, pagination and sonner. The command menu needs `pnpm ui:add command` (cmdk), then `pnpm ui:localize`. Brand tokens and the icon set come from the design-system work in the same slice.
- M1.1: `libs/policy` rewrite (permission list, `can()` over resolved permissions), the new guard, `/me/permissions`, `PermissionsProvider`/`useCan`/`<Can>` in `libs/auth-client`.
- M1.2 ([11](11-sign-in-and-setup.md)) for the post-sign-in states that sit before the shell; M1.2 and M1.5 ([12](12-platform-console.md)) for the platform head, create school and acting.
- M3.5 for the bell, nav counts and `/approvals/counts`; M3.6 for leave items in the feed.
- M2.8 for the portal pages behind the portal shell.
