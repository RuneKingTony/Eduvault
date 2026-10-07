# Tenancy: organization = school, team = campus

- Status: accepted
- Date: 2026-10-07

## Context

A school is the paying entity: it has a fee account, staff and roles. A school may have several campuses, and a person may work at several schools in different roles.

## Decision

- **Organization = school.** Roles live on `member.role` (`owner`, `admin`, `teacher`, `student`, defined in `libs/policy`), so one user holds a different role in each school. `session.activeOrganizationId` is the school in use.
- **Team = campus.** Better Auth teams are enabled. `teamMember` rows say where a member works; `session.activeTeamId` is the campus in use. Who may create or edit campuses is the Better Auth `team` permission.
- Campus details live in a thin `campus` table keyed by `team.id`. Better Auth's tables are never edited by hand.
- Better Auth's automatic default team per organization is turned off; a team without a `campus` row would be an invalid campus. Creating a campus enrols its creator, because Better Auth only activates a team the user belongs to.
- **School level:** `school_account`, one per school. **Campus aware:** `fee_schedule` (a null `campus_id` applies to every campus) and `student`.
- Every school-scoped table has `organization_id` and a foreign key to `organization`. Campus references are composite `(campus_id, organization_id)` foreign keys.
- Owners and admins see every campus. Everyone else sees only campuses they belong to. A row outside the caller's school or campus answers 404, not 403, so ids do not leak.
- A session created without an active school (scripts, direct sign-in) gets the user's first school and its first campus from a session hook.

## Out of scope

Schools under separate legal entities or bank accounts are separate organizations. A school-group concept above organizations is not modelled.

## Consequences

- Switching school is `setActive`; switching campus is `setActiveTeam`, offered only for campuses the user belongs to. A school-wide admin who is not a member of a campus can still see its data but cannot make it their active campus.
- Deleting a campus that still has students or fee schedules is refused with 409.
