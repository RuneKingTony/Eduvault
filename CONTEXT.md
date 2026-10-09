# Eduvault domain glossary

Terms the code and the people using it share. Adapted from the earlier school-management-system project; the tenancy model differs (see Tenancy). Terms for finance, the store, grading and inventory follow the data model in `docs/brainstorming/data-model-overview.md`. Where the screens use a plainer word, it is given in quotes.

## Tenancy

**School** — a Better Auth organization. The paying entity: fee account, staff, roles. A user can belong to many schools with a different role in each.

**Campus** — a Better Auth team inside a school. `teamMember` says where a member works. Details beyond a name live in the domain `campus` table keyed by `team.id`.

**Active school / campus** — `session.activeOrganizationId` and `session.activeTeamId`. Every school-scoped query is scoped by them.

**School-wide** — a money record with no campus. Only people who see every campus see it, except that a payment shows to anyone who can see one of the students it pays for, and a campus bursar can still record a payment into a school-wide money account.

**Super admin** — an Eduvault operator with the platform role `superadmin` (`user.role`). Creates schools and their owners in the platform console and belongs to no school; the first one comes from `nx run api:bootstrap-admin`, never from a screen.

**Acting** — a super admin working inside one school without belonging to it, started from the school's page in the platform console. Read-only until they give a reason (a ticket number, up to 200 characters); with one they hold owner-level permissions, with every request still audited. The SPA keeps the acted school and reason in `sessionStorage`, so a new tab or a sign-out ends it, and sends them as `X-Eduvault-Acting-Org` and `X-Eduvault-Acting-Reason`. Only a super admin's headers are read; anyone else's are ignored.

**Suspended school** — a school whose `school_account.suspended_at` is set. Its members get 403 `SchoolSuspended` on every school route and both apps show "{school} is paused on Eduvault"; sign-in still works and no data changes. A super admin can still act in it. Reactivating clears it on the next request.

**Audit log** — the append-only `audit_log` table: one `acting` row for every request a super admin makes while acting (method, path, status, reason, kept even when the request is refused or fails) and one `platform` row for each create school, suspend, reactivate and replace owner. Only the platform console reads it; no school route does, and the database refuses an update or delete.

**Temporary password** — the one-time password generated on the server when someone's account is created (a school owner today, staff and guardians later). It is shown once to whoever creates the account, never stored in clear, and the account is held on "Choose your own password" until its owner replaces it.

## Calendar and classes

**Session** — one academic year of a school (`2026/2027`), split into terms. "School year" on screen.

**Term** — one period of a session, with dates. A new school year starts with three (First, Second and Third term). One term per school is current; making a term current carries each student's class into it. Fees, scores, attendance and report cards all belong to a term.

**Holiday** — a day in a term when the school is closed. School days are a term's weekdays minus its holidays.

**Class level** — a school-wide year group (JSS 2). Every campus uses the same levels. Fees are priced by level, and each level has a grading scale and a next level; a level with no next level is the final year.

**Arm** — one class of a level on one campus (JSS 2 Gold). "Class" on screen. Positions and attendance are per arm. Arms carry over each school year and are archived, never deleted.

**Class teacher** — a teacher responsible for an arm for a school year, as lead, assistant or uniform teacher. An arm can have several, but only one lead.

**Subject teacher** — the one teacher who teaches a subject to an arm in a term.

**Enrolment** — a student's place in one session at one level. One per student per session; Start new school year (later, promotion) creates the next one.

**Placement** — which arm and campus an enrolment sits in for a term. A mid-session move adds a placement; earlier terms keep theirs.

## Students

**Admission** — a student joining a school, which also creates the portal logins for the student and any new guardian. Admission numbers are per school, prefixed with the school's admission prefix (`GF-0123`).

**New intake** — an active student in their first session at the school. New-student fee lines apply to them.

**Not seen since** — the date a student was last in school, recorded when they stop turning up. "Mark away" on screen; "Back in school" clears it.

**Inactive** — a student not seen for 5 weeks or more. Not charged for new terms. After more than a further term they are flagged "Due to be marked Left", but nothing changes until staff record it.

**Left** — a student whose leaving was recorded, with a reason and a last day. Their enrolment is withdrawn; any debt stays on Who owes.

**Graduated** — a final-year student recorded as finishing. "Graduate class" records a whole final-year class, minus anyone repeating.

**Start new school year** — the year-end bulk action that moves active students to the next level and the class of the same name, creating next year's enrolments and first-term placements. Repeaters are unticked and final-year students graduate. Promotion replaces it in the grading phase.

**Archive** — taking a student off the roll (Left or Graduated) while keeping every record. Students are never deleted.

**Guardian** — a parent or carer linked to one or more students, always with their own portal login (an email, or a username such as `okeke-family`). Any number of a student's guardians can be marked as paying fees; every linked guardian sees the child's fees and purchases in the portal, paying or not.

## Staff

**Member** — a person in a school with zero or more roles. A member with no roles sees nothing of the school, though they can still request leave.

**Leave** — a staff member's request for days off (annual, sick, personal, study, maternity or paternity). Days off count weekdays minus school holidays, and a request can't overlap the requester's own. Approved by someone with leave approval (`leave:approve`, the owner and principal by default), never by the requester.

**Announcement** — news for parents and students in the portal, for everyone or one campus. Drafted, published, pinned or withdrawn; never deleted.

**Approval** — a second person's sign-off on a correction, a payment cancellation, a store write-off or staff leave. Nobody approves or declines their own request. A school can switch approval off for each money kind ("Approval rules"); leave always needs one.

**Activity** — a line recording who did what in the school, written with the change and never edited. "Recent activity" on the dashboard, filtered by campus and by what the viewer may see. Not the platform's audit log.

**File** — an uploaded proof of transfer, school logo or guardian photo. Belongs to one record and is served only to people who may see that record; a proof is never deleted or replaced.

## Money

**Reference** — names one movement of money or stock. Applied at most once, so a retried request or a double click cannot move the same money twice; reusing it for a different request is refused.

**Journal entry** — one movement of money, as balanced debit and credit lines. Entries are never edited; corrections are new entries. "For your accountant" on screen.

**Ledger account** — one line of the school's chart of accounts. "Money category" on screen. Fee types are ledger accounts under fee income.

**Balance** — what a student owes (or holds as credit): the sum of their journal lines. Never stored. "Owing", "Paid up" or "In credit" on screen.

**Money account** — where money physically sits: a cash box, a bank account, a POS terminal, later a gateway. A closed account is retired, never deleted.

**Fee line** — one charge on the fee schedule: a fee type and amount for a level and term, optionally for one campus, only new or returning students, or opt-in. An opt-in is per student and fee type for a school year. "School fees" means tuition; everything else is "Other fees".

**Fee type** — the category of a fee line (Tuition, PTA fee, School bus). A ledger account under fee income.

**Fee period** — the term a charge is for. "Now" means the school's current term, not the admission enrollment.

**Billing run** — the bursar's "Charge students" action, a round of charges for a term. Prepares draft charges, which are checked and then sent. Running it twice never charges a student twice.

**Invoice** — the bill a parent sees: a term's fee lines and discounts, a store purchase, or a one-off charge. "Charge" on screen (`CHG-2026-00042`); "Prepared" before it is sent, "Sent" after. Never edited once sent.

**Payment** — money received, recorded at once with a receipt (`RCT-2026-00088`). One payment can be split across siblings. A bank transfer needs proof attached. "Payment rules" sets which ways to pay the school accepts.

**Void** — undoing a payment. "Cancel a payment" on screen. The row is kept and marked, and the reversal is a new movement once approved. Money records are never deleted. A store sale's payment can't be cancelled on its own.

**Adjustment** — a correction to a student's account: a credit note ("Reduce a fee"), a write-off ("Cancel a balance") or a refund of credit. Needs a second person's approval unless the school has switched that approval off. "Discounts and refunds" on screen.

**Discount** — a standing reduction for one student (a sibling discount, a scholarship), applied as a negative line each time they are charged within its terms. Every discount applies, each capped at the fees it is taken on.

**Opening balance** — a student's debt or credit, a money account's balance, or a store's stock, carried in from before the school started using Eduvault.

**Who owes** — the list of student balances, split into current students and those who left or graduated.

**Family statement** — a paying guardian's children's accounts shown together. Each child keeps their own account; the family total adds up what is owed and shows credit separately.

## Store

**Store** — the shop on a campus that sells uniforms and textbooks to students. One per campus. Items are paid for at the store, not added to school fees.

**Item** — something the school holds. In the store: a uniform piece in one size, or a textbook for a level, with a cost price (the default for new deliveries) and a selling price. Later also consumables, assets and library books.

**Average cost** — what one unit of an item in a store is worth on the books: the stock's value divided by the quantity on hand, updated by each delivery. Sales and count differences are valued at it.

**Delivery** — stock arriving at a store from a supplier, paid from a money account.

**Store sale** — a student's purchase: charged, paid and taken out of stock in one action. "Record student purchase" on screen; "Purchases" in the portal.

**Stock movement** — a change in quantity of an item in a store. Stock on hand is the sum of movements, never a stored count.

**Stock count** — a physical count of every item in a store. Any difference waits for approval as a "Store write-off", then posts at average cost to Store stock losses. One count per store waits at a time.

**Requisition** — (later phase) a staff request for consumables, approved before it is issued.

**Unit** — (later phase) one tagged physical asset or library copy, with a status and a custodian or borrower.

## Results (later phase)

**Assessment component** — one scored part of a subject's term mark (CA1, CA2, Exam), with a maximum score.

**Score** — one student's mark for one component of one subject in one term.

**Score sheet** — one arm's scores for one subject in one term. The unit a teacher submits and an approver approves.

**Result** — one student's term outcome in one subject: the total of their scores, its grade and position. Fixed when published.

**Report card** — the published snapshot of a student's term: results, position, class statistics, attendance, traits and comments. Amending creates a new version; old versions are kept.

**Grade scale** — a school's named set of grade bands, assigned per class level.

**Grade band** — one step of a grade scale: a minimum score, a grade and a remark.

**Promotion** — the end-of-session decision for an enrolment: promote, repeat, graduate or withdraw. Suggested by rule, confirmed by staff. Replaces Start new school year.
