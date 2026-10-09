# Eduvault domain glossary

Terms the code and the people using it share. Adapted from the earlier school-management-system project; the tenancy model differs (see Tenancy). Terms for finance, the store, grading and inventory follow the data model in `docs/brainstorming/data-model-overview.md`. Where the screens use a plainer word, it is given in quotes.

## Tenancy

**School** — a Better Auth organization. The paying entity: fee account, staff, roles. A user can belong to many schools with a different role in each.

**Campus** — a Better Auth team inside a school. `teamMember` says where a member works. Details beyond a name live in the domain `campus` table keyed by `team.id`.

**Active school / campus** — `session.activeOrganizationId` and `session.activeTeamId`. Every school-scoped query is scoped by them.

**School-wide** — a money record with no campus. Only people who see every campus see it, except that a payment shows to anyone who can see one of the students it pays for.

## Calendar and classes

**Session** — one academic year of a school (`2026/2027`), split into terms. "School year" on screen.

**Term** — one period of a session, with dates. A new school year starts with three (First, Second and Third term). One term per school is current. Fees, scores, attendance and report cards all belong to a term.

**Holiday** — a day in a term when the school is closed. School days are a term's weekdays minus its holidays.

**Class level** — a school-wide year group (JSS 2). Every campus uses the same levels. Fees are priced by level, and each level has a grading scale and a next level; a level with no next level is the final year.

**Arm** — one class of a level on one campus (JSS 2 Gold). "Class" on screen. Positions and attendance are per arm. Arms carry over each school year and are archived, never deleted.

**Class teacher** — a teacher responsible for an arm for a school year, as lead, assistant or uniform teacher. An arm can have several.

**Subject teacher** — the one teacher who teaches a subject to an arm in a term.

**Enrolment** — a student's place in one session at one level. One per student per session; promotion creates the next one.

**Placement** — which arm and campus an enrolment sits in for a term. A mid-session move adds a placement; earlier terms keep theirs.

## Students

**Admission** — a student joining a school. Admission numbers are per school, prefixed with the school's short name (`GF-0123`).

**New intake** — an active student in their first session at the school. New-student fee lines apply to them.

**Not seen since** — the date a student was last in school, recorded when they stop turning up. "Mark away" on screen; "Back in school" clears it.

**Inactive** — a student not seen for 5 weeks or more. Not charged for new terms. After more than a further term they are flagged "Due to be marked Left", but nothing changes until staff record it.

**Left** — a student whose leaving was recorded, with a reason and a last day. Their enrolment is withdrawn; any debt stays on Who owes.

**Graduated** — a final-year student recorded as finishing. "Graduate class" records a whole final-year class, minus anyone repeating.

**Archive** — taking a student off the roll (Left or Graduated) while keeping every record. Students are never deleted.

**Guardian** — a parent or carer linked to one or more students, always with their own portal login (an email, or a username such as `okeke-family`). Any number of a student's guardians can be marked as paying fees.

## Staff

**Member** — a person in a school with zero or more roles. A member with no roles can do nothing.

**Leave** — a staff member's request for days off (annual, sick, personal, study, maternity or paternity). Approved by someone with leave approval (`leave:approve`, the owner and principal by default), never by the requester.

**Announcement** — news for parents and students in the portal, for everyone or one campus. Drafted, published, pinned or withdrawn; never deleted.

**Approval** — a second person's sign-off on a correction, a payment cancellation or a store write-off. Nobody approves their own request. A school can switch approval off for each kind ("Approval rules").

## Money

**Reference** — names one movement of money or stock. Applied at most once, so a retried request or a double click cannot move the same money twice.

**Journal entry** — one movement of money, as balanced debit and credit lines. Entries are never edited; corrections are new entries. "For your accountant" on screen.

**Ledger account** — one line of the school's chart of accounts. "Money category" on screen. Fee types are ledger accounts under fee income.

**Balance** — what a student owes (or holds as credit): the sum of their journal lines. Never stored. "Owing", "Paid up" or "In credit" on screen.

**Money account** — where money physically sits: a cash box, a bank account, a POS terminal, later a gateway.

**Fee line** — one charge on the fee schedule: a fee type and amount for a level and term, optionally for one campus, only new or returning students, or opt-in. "School fees" means tuition; everything else is "Other fees".

**Fee type** — the category of a fee line (Tuition, PTA fee, School bus). A ledger account under fee income.

**Fee period** — the term a charge is for. "Now" means the school's current term, not the admission enrollment.

**Billing run** — the bursar's "Charge students" action, a round of charges for a term. Prepares draft charges, which are checked and then sent. Running it twice never charges a student twice.

**Invoice** — the bill a parent sees: a term's fee lines and discounts, a store purchase, or a one-off charge. "Charge" on screen (`CHG-2026-00042`); "Prepared" before it is sent, "Sent" after. Never edited once sent.

**Payment** — money received, recorded at once with a receipt (`RCT-2026-00088`). One payment can be split across siblings. A bank transfer needs proof attached. "Payment rules" sets which ways to pay the school accepts.

**Void** — undoing a payment. "Cancel a payment" on screen. The row is kept and marked, and the reversal is a new movement once approved. Money records are never deleted.

**Adjustment** — a correction to a student's account: a credit note ("Reduce a fee"), a write-off ("Cancel a balance") or a refund of credit. Needs a second person's approval unless the school has switched that approval off. "Discounts and refunds" on screen.

**Discount** — a standing reduction for one student (a sibling discount, a scholarship), applied as a negative line each time they are charged within its terms.

**Opening balance** — a student's debt or credit, or a store's stock, carried in from before the school started using Eduvault.

**Who owes** — the list of student balances, split into current students and those who left or graduated.

**Family statement** — a paying guardian's children's accounts shown together. Each child keeps their own account.

## Store

**Store** — the shop on a campus that sells uniforms and textbooks to students. One per campus. Items are paid for at the store, not added to school fees.

**Item** — something the school holds. In the store: a uniform piece in one size, or a textbook for a level, with a cost price and a selling price. Later also consumables, assets and library books.

**Delivery** — stock arriving at a store from a supplier, paid from a money account.

**Store sale** — a student's purchase: charged, paid and taken out of stock in one action. "Record student purchase" on screen; "Purchases" in the portal.

**Stock movement** — a change in quantity of an item in a store. Stock on hand is the sum of movements, never a stored count.

**Stock count** — a physical count of a store. Any difference waits for approval as a "Store write-off", then posts at cost to Store stock losses.

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

**Promotion** — the end-of-session decision for an enrolment: promote, repeat, graduate or withdraw. Suggested by rule, confirmed by staff.
