# Eduvault domain glossary

Terms the code and the people using it share. Adapted from the earlier school-management-system project; the tenancy model differs (see Tenancy).

## Tenancy

**School** — a Better Auth organization. The paying entity: fee account, staff, roles. A user can belong to many schools with a different role in each.

**Campus** — a Better Auth team inside a school. `teamMember` says where a member works. Details beyond a name live in the domain `campus` table keyed by `team.id`.

**Active school / campus** — `session.activeOrganizationId` and `session.activeTeamId`. Every school-scoped query is scoped by them.

## Money

**Reference** — names one movement of money. Applied at most once, so a retried request or a double click cannot move the same money twice.

**Void** — undoing a payment. The row is kept and marked, and the reversal is a new movement. Money records are never deleted.

**Fee period** — the session and term a charge is for. "Now" means the school's current session and term, not the admission enrollment.

## Results

**Result** — one student's mark in one subject for one session and term. Identified by (student, subject, session, term).

**Grade band** — one step of a school's own grading scale. Each school defines its scale.

## Students

**Admission** — a student joining a school. Admission numbers come from one sequence shared across schools.

**Archive** — taking a student off the roll while keeping every record. Students are never deleted.
