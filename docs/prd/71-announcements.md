# PRD: Announcements

- Status: draft (pre-spec)
- Source: brand prototype `https://claude.ai/artifact/1hsDyr1KdUaYD2hnuA9sfY`, version `1791539787-0c53` (script lines 1810–1888, portal 4280–4298, seed 1040–1047)
- Milestone and slice: `M2.7` (staff screen, API, feed); portal display ships with `M2.8` (see [roadmap](README.md))
- Related: [data-model-overview.md](../brainstorming/data-model-overview.md#foundation-model) (`announcement` row, null `campus_id` rule), [permissions list](../brainstorming/data-model-overview.md#permission-list) (`announcement`), [70-dashboard](70-dashboard.md), [72-portal](72-portal.md), [technical reference](../technical-reference.md) decisions [D-001, D-005, D-009, D-010, D-016](../technical-reference.md#decision-log)

## Summary

Announcements are short news items the school office writes for parents and students. Staff draft, publish, pin and withdraw them in `web-admin`; families read them on the portal home page, for the whole school or for one campus. Nothing is ever deleted: a withdrawn item leaves the portal but stays on file.

## Who uses it

| Persona (seed)                     | Permission(s)                                                | What they can do here                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Owner (Funmi)                      | `announcement:create`, `read`, `update`                      | Everything                                                                                                                         |
| Administrator (Tunde)              | `announcement:create`, `read`, `update`, `campus:readAll`    | Everything, for every campus, including "Everyone" items                                                                           |
| Principal (Grace, starter)         | `announcement:create`, `read`, `update`, `campus:readAll`    | Everything, for every campus, including "Everyone" items                                                                           |
| Campus-scoped writer (custom role) | `announcement:create`, `read`, `update`, no `campus:readAll` | Writes and manages items for their own campuses only; reads "Everyone" items but can't create, edit, publish, withdraw or pin them |
| Bursar, Teacher                    | none                                                         | No Announcements page. Teachers see published items on their dashboard through the feed (R15)                                      |
| Student, Guardian                  | `student:readOwn`                                            | Read published items for everyone or their child's campus on the portal                                                            |
| Super admin acting read-only       | `announcement:read`                                          | Read the list; no write controls                                                                                                   |

Scopes: campus scope. A member sees announcements for everyone plus those for campuses in their scope. Reading or changing an announcement for a campus outside scope answers 404. In scope without the permission answers 403 [tenancy-001]. Changing an "Everyone" item, or targeting "Everyone", also needs `campus:readAll` (R8).

## Screens

### Announcements (staff)

- Route `/announcements` in `web-admin`; nav section **Overview**, third item after Dashboard and Approvals; phase F1; gate `announcement:read`. Without it the nav link is hidden and the route redirects to the dashboard.
- Breadcrumb: "Overview › Announcements".
- Header: title "Announcements"; description "News for parents and students. It appears on their portal home page."; primary action "New announcement" (plus icon), shown only with `announcement:create`.
- **Tabs** with counts: "Published", "Drafts", "Withdrawn". Default tab: Published. After a save or status change, the page switches to the tab of the item's new status.
- **List** (one card, no table). Order: pinned published items first, then newest date first. Ten rows per page per tab with the shared pager ("Showing 1 to 10 of {n}", Previous, numbers, Next), hidden at 10 or fewer rows.
- Each row:
  - Badges: tag (tone per tag: Event = brand, Academics = secondary, Fees = destructive, General = outline); "Pinned" (outline, pin icon) when published and pinned; audience ("Everyone" with a users icon, or "{campus} families" with a map-pin icon).
  - Title in medium weight; message in muted small text (full text, max 80 characters per line).
  - Footer line: "Published {date}", "Draft saved {date}" or "Withdrawn {date}", then " by {author name}".
  - Row actions, only with `announcement:update` (and, on an "Everyone" item, `campus:readAll`), right-aligned, small ghost buttons:

    | Status    | Actions                                     |
    | --------- | ------------------------------------------- |
    | Published | "Edit", "Pin to top" or "Unpin", "Withdraw" |
    | Draft     | "Edit", "Publish" (primary)                 |
    | Withdrawn | "Edit", "Publish again" (outline)           |

- **Empty states**, per tab:

  | Tab       | Title                   | Text                                                                   | Action                                          |
  | --------- | ----------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
  | Published | "Nothing published yet" | "Write an announcement and parents see it on their portal home page."  | "New announcement" (with `announcement:create`) |
  | Drafts    | "No drafts"             | "Save an announcement as a draft to finish it later."                  | —                                               |
  | Withdrawn | "Nothing withdrawn"     | "Withdrawn announcements disappear from the portal but are kept here." | —                                               |

- No delete action anywhere.

#### Sheet: New announcement / Edit announcement

- Opens from "New announcement" (`announcement:create`) or a row's "Edit" (`announcement:update`). Large side sheet.
- Title "New announcement" or "Edit announcement"; description "Parents and students see this on their portal home page."
- Fields:

  | Field          | Control                                                                                                                                                                                 | Required | Default                                                                        | Validation                                               |
  | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
  | Title          | text input, max 80 characters, placeholder "e.g. Mid-term break starts Thursday"                                                                                                        | yes      | empty or current                                                               | trimmed, 1–80 characters                                 |
  | Message        | textarea, 5 rows, placeholder "What families need to know, and what they should do."; hint "Keep it short. Say when, where and what to bring or pay."; a counter "{n} / 2,000" under it | yes      | empty or current                                                               | trimmed, 1–2,000 characters; the textarea stops at 2,000 |
  | Type           | select: General, Academics, Event, Fees                                                                                                                                                 | yes      | General, or current                                                            | one of the four                                          |
  | Who sees it    | select: "Everyone" (only with `campus:readAll`), then "{campus} families only" for each campus in scope                                                                                 | yes      | the single campus when exactly one is in scope, otherwise Everyone; or current | campus in scope; "Everyone" needs `campus:readAll` (R8)  |
  | Pin to the top | checkbox with text "Stays first on the portal until you unpin it. Use it for anything urgent."                                                                                          | no       | unchecked, or current                                                          | ignored when saving as a draft                           |

- Empty title or message: the form is not sent and the toast "Add a title and a message." (danger) shows.
- Footer buttons:
  - "Cancel" (ghost) closes the sheet.
  - "Save as draft" (outline, pencil icon), hidden when editing a published item.
  - Primary: "Publish" (send icon), or "Save changes" when editing a published item.
- On submit:

  | Case                              | Effect                                    | Toast                                           |
  | --------------------------------- | ----------------------------------------- | ----------------------------------------------- |
  | New, Save as draft                | Creates a draft, unpinned                 | "Saved as a draft. Parents can’t see it yet."   |
  | New, Publish                      | Creates a published item, published today | "Published to {everyone \| {campus} families}." |
  | Draft or withdrawn, Save as draft | Stays or becomes a draft, unpinned        | "Saved as a draft. Parents can’t see it yet."   |
  | Draft or withdrawn, Publish       | Becomes published, published today        | "Published to {everyone \| {campus} families}." |
  | Published, Save changes           | Content updated; publish date unchanged   | "Changes saved. Families see the new version."  |

  Toast copy keeps the campus name capitalised ("Published to Lekki families."; see gaps). The prototype's toast action "See it as a parent" is prototype tooling (it switches persona) and is not built.

#### Row actions

| Action                  | Gate                  | Effect                                                    | Toast                                           |
| ----------------------- | --------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Pin to top              | `announcement:update` | Sets pinned on a published item                           | "Pinned to the top of the portal."              |
| Unpin                   | `announcement:update` | Clears pinned                                             | "Unpinned."                                     |
| Withdraw                | `announcement:update` | Published → withdrawn, unpinned. No confirm dialog        | "Withdrawn. It no longer shows on the portal."  |
| Publish / Publish again | `announcement:update` | Draft or withdrawn → published, publish date set to today | "Published. Families see it on the portal now." |

#### States

- Loading: skeleton rows inside the card.
- Error: `ErrorMessage` inside the card.
- Denied (403): no nav link; a direct visit redirects to the dashboard.
- Not found (404): editing an item for a campus outside scope, or from another school, closes the sheet with "This announcement no longer exists or is outside your campuses." (new copy; the prototype never reaches this).
- Read-only (acting super admin): list and tabs render; "New announcement", "Edit" and the row actions are hidden.

### Announcements on the portal (display)

Built in M2.8 inside [72-portal](72-portal.md) Home; specified here so the rules live with the data.

- Card "Announcements", icon bell, description "From the school office. Tap one to read more."
- Up to five items: published, for everyone or the viewed student's campus (their placement campus this term, else their home campus). Pinned first, then newest.
- Each item is a button: tag badge (same tones as staff), "Pinned" in small muted text when pinned, a "New" badge (success) when published within the last 7 days and not pinned, the date on the right, the title in bold. Pinned items are open by default and show the message; tapping any item toggles its message.
- Home tile "Announcements": value = number of items for this student published within the last 7 days (pinned included), sub-line "New this week".
- Empty state: none in the prototype; use "No news from the school yet." (new copy; see gaps).

## Business rules

1. **R1** An announcement has a title (1–80 characters after trimming), a message (1–2,000 characters after trimming), a tag (general, academics, event, fees), an audience (null = everyone, or one campus), a status (draft, published, withdrawn), a pinned flag and an author.
2. **R2** Announcements are never deleted. There is no delete endpoint; the FK from `organization` is `ON DELETE RESTRICT` like other kept records.
3. **R3** Only a published announcement can be pinned. Saving as a draft or withdrawing clears the pin. The database enforces `NOT pinned OR status = 'published'`.
4. **R4** Moving to published from new, draft or withdrawn sets `published_on` to today. Editing an already published item does not change `published_on`.
5. **R5** Withdraw is allowed only from published. Publish is allowed only from draft or withdrawn. Pin and unpin are allowed only on published. Any other transition answers 409.
6. **R6** Editing a published item may change title, message, tag, audience and pin, but cannot turn it into a draft in one step (the editor hides "Save as draft"); the API refuses `status: 'draft'` on a published item with 409. Withdraw first.
7. **R7** A staff member lists, reads and edits only announcements for everyone or for a campus in their scope. Others answer 404.
8. **R8** The audience on create or edit must be null or a campus in the member's scope; a campus outside scope answers 404. Only a member with `campus:readAll` may target "everyone" (null) or edit, publish, withdraw, pin or unpin an "everyone" item; a campus-scoped member gets 403 "Only someone who sees every campus can change announcements for everyone." (new copy). A campus office doesn't speak for the whole school or withdraw another campus's news.
9. **R9** Staff list order: published pinned first, then by date (publish date for published, last save for drafts, withdrawal date for withdrawn) newest first.
10. **R10** The portal shows only published items whose audience is null or the viewed student's current campus, pinned first, then newest `published_on` first.
11. **R11** "New" on the portal = `published_on` within 7 days of today and not pinned.
12. **R12** Several items may be pinned at once; there is no limit.
13. **R13** Every create, edit, publish, withdraw, pin and unpin writes an `activity_event` (pillar foundation), for example "Announcement “PTA meeting, Saturday 17 October” published by Tunde Bakare." (see [70-dashboard](70-dashboard.md) OD-70-1).
14. **R14** The dashboard task "{n} announcement draft(s) not published" counts drafts in the member's campus scope, for holders of `announcement:update`.
15. **R15** Any member of the school may read the feed of published announcements in their campus scope (`GET /announcements/feed`), with or without `announcement:read`; the teacher dashboard card uses it ([70-dashboard](70-dashboard.md)). The content is already public to families.
16. **R16** There is no scheduling or expiry: an item shows from the moment it is published until it is withdrawn.
17. **R17** Publishing and withdrawing take effect at once, with no confirmation; both can be undone and nothing is lost.

## Data

Table `announcement` as in [data-model-overview.md](../brainstorming/data-model-overview.md#foundation-model): `title`, `body`, `tag`, `campus_id`, `status`, `pinned`, `published_on`, `created_by`, plus `id`, `organization_id`, `created_at`, `updated_at`.

Additions not in the data-model docs:

- `withdrawn_at TIMESTAMPTZ NULL`: the prototype shows the original publish date beside "Withdrawn", which is wrong; this fixes it.
- `updated_by TEXT NULL` (user id): who last changed it, for the row footer and activity.
- Constraints: `CHECK (char_length(title) BETWEEN 1 AND 80)`, `CHECK (char_length(body) BETWEEN 1 AND 2000)`, `CHECK (tag IN ('general','academics','event','fees'))`, `CHECK (status IN ('draft','published','withdrawn'))`, `CHECK (NOT pinned OR status = 'published')`, `CHECK (status <> 'published' OR published_on IS NOT NULL)`.
- Composite FK `(campus_id, organization_id)` → `campus (team_id, organization_id)`.
- Index `(organization_id, status, published_on DESC)`.

Migration: one dbmate migration in M2.7 creating `announcement`; `pnpm drift:fix` regenerates `schema.sql` and `db-types.ts`.

Permission: add `announcement: ['create', 'read', 'update']` to `libs/policy` `statements.ts`; grant it to the `administrator` starter role (and the owner by default).

## API

New `announcement` module.

| Method | Path                                        | Permission                        | Request                                                                                       | Response                                                                                             | Errors                                                                                                                    |
| ------ | ------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/announcements`                            | `announcement:read`               | `?status=published\|draft\|withdrawn` (optional), `page` (default 1), `pageSize` (default 10) | `{ items: Announcement[], total, counts: { published, draft, withdrawn } }` in scope, ordered per R9 | 403                                                                                                                       |
| GET    | `/announcements/:id`                        | `announcement:read`               | —                                                                                             | `Announcement`                                                                                       | 403, 404 (other school or campus out of scope)                                                                            |
| POST   | `/announcements`                            | `announcement:create`             | `{ title, body, tag, campusId: string \| null, pinned, status: 'draft' \| 'published' }`      | `Announcement`                                                                                       | 400 (title > 80, empty body, body > 2,000, bad tag), 403 ("Everyone" without `campus:readAll`), 404 (campus out of scope) |
| PATCH  | `/announcements/:id`                        | `announcement:update`             | `{ title?, body?, tag?, campusId?, pinned?, status?: 'draft' \| 'published' }`                | `Announcement`                                                                                       | 400, 403 (R8), 404, 409 (R5, R6)                                                                                          |
| POST   | `/announcements/:id/publish`                | `announcement:update`             | —                                                                                             | `Announcement`                                                                                       | 403, 404, 409 (already published)                                                                                         |
| POST   | `/announcements/:id/withdraw`               | `announcement:update`             | —                                                                                             | `Announcement`                                                                                       | 403, 404, 409 (not published)                                                                                             |
| PUT    | `/announcements/:id/pin`                    | `announcement:update`             | `{ pinned: boolean }`                                                                         | `Announcement`                                                                                       | 403, 404, 409 (not published)                                                                                             |
| GET    | `/announcements/feed`                       | member of the active school (R15) | `?limit` (default 4, max 20)                                                                  | `AnnouncementSummary[]` published, in campus scope, pinned first                                     | —                                                                                                                         |
| GET    | `/portal/students/:studentId/announcements` | `student:readOwn`                 | `?limit` (default 5)                                                                          | `AnnouncementSummary[]` per R10, plus `newThisWeek` count                                            | 403, 404 (student not in student scope)                                                                                   |

`Announcement` = `{ id, title, body, tag, campusId, campusName, status, pinned, publishedOn, withdrawnAt, createdBy: {id, name}, updatedAt }`. `AnnouncementSummary` = `{ id, title, body, tag, pinned, publishedOn }`. Contract types in `@eduvault/api-contract` under `announcements.*` and `portal.announcements`.

## Acceptance criteria

1. Given Tunde holds `announcement:create`, when he publishes "Inter-house sports day" for Lekki families, then it appears under Published with "Lekki families" and the toast "Published to Lekki families." shows.
2. Given a title of 81 characters, when the form is submitted through the API, then it answers 400 and nothing is saved; in the sheet the input stops at 80 characters.
3. Given an empty message, when "Publish" is pressed, then the toast "Add a title and a message." shows and nothing is saved.
4. Given a draft, when "Publish" is pressed on its row, then it moves to Published with today's date and the Published tab opens.
5. Given a pinned published item, when "Withdraw" is pressed, then it moves to Withdrawn, is no longer pinned, and the footer reads "Withdrawn {today}".
6. Given a withdrawn item published on 21 Sep, when "Publish again" is pressed on 7 Oct, then its publish date becomes 7 Oct.
7. Given a published item published on 2 Oct, when its message is edited and saved on 7 Oct, then its publish date stays 2 Oct and the toast is "Changes saved. Families see the new version."
8. Given a draft, when `PUT /announcements/:id/pin {pinned:true}` is called, then it answers 409.
9. Given a Lekki-only member with `announcement:read`, when they list announcements, then items for Ikeja families are absent and `GET /announcements/:ikejaId` answers 404.
10. Given a member of school B, when they call `GET /announcements/:id` for a school A item, then it answers 404.
11. Given the Bursar role without `announcement:read`, when `GET /announcements` is called, then it answers 403 and the nav link is hidden.
12. Given Ada (Lekki) and a published item for Ikeja families, when Ada's portal Home loads, then the item is not shown; an item for everyone is.
13. Given a pinned item published 10 days ago and an unpinned item published 2 days ago, when the portal card renders, then the pinned one is first and open, and only the second has the "New" badge.
14. Given an acting super admin without a reason, when they open Announcements, then no write control renders and `POST /announcements` answers 403.
15. Given any announcement, when a client calls `DELETE /announcements/:id`, then the route does not exist (404 from the router).
16. Given a Lekki-only member with `announcement:create` and `announcement:update`, when they open the sheet, then "Who sees it" offers only "Lekki families only"; a `POST` with `campusId: null` answers 403, and withdrawing an "Everyone" item answers 403.
17. Given a message of 2,001 characters sent through the API, then it answers 400 and nothing is saved; in the sheet the counter stops at "2,000 / 2,000".
18. Given 23 published announcements, when the Published tab opens, then page 1 shows 10 rows and "Showing 1 to 10 of 23".
19. Given a teacher without `announcement:read`, when they call `GET /announcements/feed`, then they get the published items for their campuses.

## Tests

- Unit (`nx run api:test`): transition table (R4–R6) as a pure function; audience validation. (`nx run web-admin:test`): editor shows "Save as draft" only when not editing a published item; default audience with one campus in scope; buttons hidden without `announcement:update`.
- Integration (`api:test-integration`):
  - Isolation: cross-school 404 on every route; a campus-scoped member gets 404 for another campus's item and cannot create one for it [tenancy-002].
  - 403 per route without its permission.
  - The `NOT pinned OR status = 'published'` check and the title and body length checks reject bad rows at the database.
  - A campus-scoped writer gets 403 creating, editing, withdrawing or pinning an "Everyone" item.
  - Portal route: a guardian gets 404 for a student not linked to them; a student sees only their campus's items.
- E2E (opt-in, `eduvault-e2e`): administrator creates a draft, publishes it to one campus, pins it; then the student persona sees it first on portal Home; administrator withdraws it and it disappears.

## Open decisions

| #       | Question                                                                                                                              | Options                                                                                                                       | Recommendation                                                                              | Confidence                                                      | Decided |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------- |
| OD-71-1 | May a member without `campus:readAll` publish, edit or withdraw an announcement for everyone? The prototype always offers "Everyone". | (a) yes; (b) only `campus:readAll` holders may target or change "everyone" items; campus-scoped members target their campuses | (b): a campus office shouldn't speak for the whole school or withdraw another campus's news | Medium: some schools may want campus heads to post school-wide  | Adopted |
| OD-71-2 | Should publishing or withdrawing ask for confirmation? The prototype acts at once.                                                    | (a) no confirm, rely on Publish again; (b) confirm dialog                                                                     | (a) no confirm                                                                              | Medium: both actions are reversible and kept on file            | Adopted |
| OD-71-3 | Maximum message length?                                                                                                               | (a) none; (b) 2,000 characters                                                                                                | (b) 2,000, with a counter in the sheet                                                      | Medium: the hint says "Keep it short"; protects the portal card | Adopted |
| OD-71-4 | How do members without `announcement:read` (teachers) read the dashboard card?                                                        | (a) `GET /announcements/feed` for any member, published only; (b) require `announcement:read` and drop the card for teachers  | (a)                                                                                         | Medium: the content is already public to families               | Adopted |
| OD-71-5 | Scheduled publishing or expiry dates?                                                                                                 | (a) not now; (b) `publish_at` / `expires_on`                                                                                  | (a) not now                                                                                 | High: not in the prototype                                      | Adopted |
| OD-71-6 | The staff list has no pagination or search.                                                                                           | (a) add the shared 10-per-page pager per tab; (b) none                                                                        | (a)                                                                                         | High: a school posts weekly; lists grow                         | Adopted |
| OD-71-7 | Can families see older announcements beyond the latest five?                                                                          | (a) no; (b) a "See all" list on the portal                                                                                    | (b) a simple list page later in M2.8 if cheap, otherwise keep five                          | Low: depends on how much schools post                           | Adopted |

## Prototype gaps noticed

- "Withdrawn {date}" shows the original publish date, not the withdrawal date.
- The publish toast lowercases the whole audience ("lekki families").
- Pin and unpin write no activity event; publish, withdraw and saves do.
- No empty state on the portal Announcements card.
- The portal Home tile counts pinned items published this week, while the "New" badge skips pinned items, so the tile can say 1 when no "New" badge shows.
- The teacher dashboard card is filtered only by campus scope, with no permission.
- "See it as a parent" in toasts switches persona; prototype tooling only.
- The prototype has no 404 path for editing an item that went out of scope.
- `ANN_TONE` is defined in the portal section but used by the staff list too; one shared tag-to-tone map belongs in `libs/ui`.

## Dependencies

- M1.1 (permission list, guard, nav gating), M2.2 (campuses), M1.3 (members, for author names).
- `activity_event`, which lands with M2.4 ([D-016](../technical-reference.md#decision-log)), for R13.
- Portal display depends on M2.8 and student scope.
- Notifications (email or SMS on publish) are out of scope per the overview's assumption 9.
