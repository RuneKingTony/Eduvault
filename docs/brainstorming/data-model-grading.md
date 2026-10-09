# Data model: student grading

- Status: brainstorm (not yet an ADR)
- Date: 2026-10-09
- Part of: [data model overview](data-model-overview.md), aligned to the brand prototype
- Phases: the curriculum (subjects, levels, electives, subject teachers) ships at F2 with the store. Everything else here is F3; the prototype has no scores, report cards, attendance or promotion yet, so this keeps the earlier design.

## Goal

Let teachers enter continuous assessment and exam scores for their own subjects, take a school through review and publishing, and produce a stable, private report card each term with positions, class statistics, attendance, traits and comments, and an annual average that drives promotion.

## Decisions taken

| Question                  | Answer                                                                                                                                                                            | Rejected, and why                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| How a term score is built | Configurable assessment components with maximum scores (CA1 20, CA2 20, Exam 60), optionally per level; one score per component                                                   | Single total (no breakdown on the card); free-form gradebook (heavy, overkill for termly cards)                      |
| Report card contents      | Position and class statistics, cumulative annual average, attendance summary, traits and comments                                                                                 | (All four chosen)                                                                                                    |
| Subjects and teachers     | School subject catalogue; `level_subject` (core or elective); electives per student per session; one `subject_teacher` per arm, subject and term                                  | Subjects per arm with no teacher link (any teacher edits any mark); everyone takes everything (breaks SS streams)    |
| Result lifecycle          | Draft, submitted (locked), approved, published; changes after publish are amendments with a reason and history                                                                    | Draft straight to published (no review); editable forever (marks change under parents' eyes, no audit)               |
| Positions and statistics  | Computed once at publish and frozen into a versioned report-card snapshot; the portal reads only the student's own snapshot                                                       | Compute on every read (numbers shift; portal reads classmates' scores); no positions (contradicts the card contents) |
| Grading scales            | Named scales of bands; each class level points to one; the resolved grade is frozen on the card                                                                                   | One scale per school (breaks primary + secondary schools); a scale per subject (rarely needed)                       |
| Attendance                | Daily register per arm (optional afternoon session); report-card counts derived                                                                                                   | Per lesson (needs a timetable); term summary typed in (no daily record)                                              |
| Traits and comments       | School-defined trait list and rating scale; class-teacher and principal comments as free text; optional comment bank                                                              | Traits fixed in code (schools disagree on the list); comments only (contradicts the card contents)                   |
| Promotion                 | A rule per level suggests promote, repeat or graduate; staff review, override with a reason, and confirm. Until then, final-year classes graduate through F0's **Graduate class** | Fully manual (slow at scale); fully automatic (promotion is a judgment call)                                         |

## Model

Every table also has `id`, `organization_id`, `created_at` and `updated_at` unless noted. Results are never deleted [risk-001].

### Curriculum (F2)

| Table             | Key columns                                                         | Constraints and notes                                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subject`         | `code` ('MTH'), `name`, `retired_at`                                | `UNIQUE (organization_id, code)`; code is up to 5 letters, stored upper-case. Subjects are always FKs, never text (the old app's duplicate-results bug)                                                                                                                                                                |
| `level_subject`   | `class_level_id`, `subject_id`, `kind` (core, elective), `sequence` | `UNIQUE (class_level_id, subject_id)`. `sequence` orders the card                                                                                                                                                                                                                                                      |
| `student_subject` | `enrollment_id`, `subject_id`                                       | Electives only, per session through the enrolment; core subjects apply to everyone at the level                                                                                                                                                                                                                        |
| `subject_teacher` | `class_arm_id`, `subject_id`, `term_id`, `user_id`                  | `UNIQUE (class_arm_id, subject_id, term_id)`: one teacher per arm, subject and term; assigning again replaces them. Set for the current term with `class:assignTeacher`, from members on the arm's campus who hold `class:read`. Gives entry rights for that arm and subject (F3) and feeds class scope (see overview) |

### Assessment and scores (F3)

| Table                  | Key columns                                                                                                                                                      | Constraints and notes                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assessment_component` | `class_level_id` (nullable = school default), `code` ('CA1'), `name`, `max_score`, `sequence`, `retired_at`                                                      | A level's components are its own rows if any exist, otherwise the school defaults. Maximums for a level sum to 100. Changing them mid-term is refused once any score exists for that term |
| `score_sheet`          | `term_id`, `class_arm_id`, `subject_id`, `status` (draft, submitted, approved), `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `rejection_reason` | `UNIQUE (term_id, class_arm_id, subject_id)`. The unit of entry and review. Submit locks it; reject returns it to draft                                                                   |
| `score`                | `score_sheet_id`, `enrollment_id`, `assessment_component_id`, `value` (numeric, 0..max), `is_absent`, `entered_by`                                               | `UNIQUE (score_sheet_id, enrollment_id, assessment_component_id)`. Editable only while the sheet is draft                                                                                 |
| `score_history`        | `score_id`, `old_value`, `new_value`, `reason`, `changed_by`, `changed_at`                                                                                       | Written for every amendment after publish                                                                                                                                                 |

### Grading scales (F3)

| Table         | Key columns                                                 | Constraints and notes                                                                   |
| ------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `grade_scale` | `name` ('Senior WAEC'), `retired_at`                        | `class_level.grade_scale_id` points here                                                |
| `grade_band`  | `grade_scale_id`, `min_score`, `grade`, `remark`, `is_pass` | `UNIQUE (grade_scale_id, grade)`; `UNIQUE (grade_scale_id, min_score)`. Inclusive floor |

### Attendance (F3)

| Table             | Key columns                                                                     | Constraints and notes                                                                             |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `attendance_day`  | `class_arm_id`, `date`, `period` (am, pm), `taken_by`                           | `UNIQUE (class_arm_id, date, period)`. The date must fall in a term and not on a `school_holiday` |
| `attendance_mark` | `attendance_day_id`, `enrollment_id`, `status` (present, absent, late, excused) | `UNIQUE (attendance_day_id, enrollment_id)`. Late counts as present on the card                   |

The `pm` period is off unless the school turns it on. "Days open" is the count of term weekdays minus holidays; "present" and "absent" are counted from marks.

### Traits and comments (F3)

| Table            | Key columns                                                                         | Constraints and notes                       |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------------------------------- |
| `trait`          | `group` (affective, psychomotor), `name`, `sequence`, `retired_at`                  | School-defined                              |
| `rating_scale`   | `value` (5..1), `label` ('Excellent')                                               | `UNIQUE (organization_id, value)`           |
| `trait_rating`   | `enrollment_id`, `term_id`, `trait_id`, `value`, `rated_by`                         | `UNIQUE (enrollment_id, term_id, trait_id)` |
| `report_comment` | `enrollment_id`, `term_id`, `role` (class_teacher, principal), `text`, `written_by` | `UNIQUE (enrollment_id, term_id, role)`     |
| `comment_bank`   | `role`, `text`                                                                      | Optional reusable comments                  |

### Report-card snapshot (F3)

| Table              | Key columns                                                                                                                                                                                                                                                                    | Constraints and notes                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `report_card_run`  | `term_id`, `class_arm_id`, `version`, `published_by`, `published_at`, `reason` (amendments)                                                                                                                                                                                    | `UNIQUE (term_id, class_arm_id, version)`. Publishing needs every subject sheet for the arm approved |
| `report_card`      | `run_id`, `enrollment_id`, `student_id`, `term_id`, `class_arm_id`, `total`, `average`, `position`, `arm_size`, `annual_average` (term 3 only), `days_open`, `days_present`, `days_absent`, `traits` (jsonb), `comments` (jsonb), `source` (computed, import), `superseded_at` | Partial unique `(enrollment_id, term_id) WHERE superseded_at IS NULL`. Frozen once written           |
| `report_card_line` | `report_card_id`, `subject_id`, `subject_name`, `component_scores` (jsonb), `total`, `grade`, `remark`, `subject_position`, `class_average`, `class_high`, `class_low`                                                                                                         | Names and grades are copied, so later edits to subjects or scales don't change past cards            |

- **Ranking:** competition ranking, so ties share a position (1, 1, 3). Position is within the arm; subject position is within the arm for that subject.
- **Annual average:** on the last term's card, the mean of that session's term averages, read from the current snapshots of the same enrolment (imported cards included).
- **Amendment:** an amendment (by someone holding `result:amend`, with a reason) writes `score_history`, re-runs the snapshot for the whole arm as a new `report_card_run` version, and sets `superseded_at` on the previous cards. Classmates' positions may change; their previous versions are kept.
- **Portal:** reads only `report_card` rows for the signed-in student or a guardian's linked students, current version only. When the fee hold is on and the student's balance is above the threshold, the card is withheld and the portal says why. Staff with `result:read` always see it.

### Promotion (F3)

| Table            | Key columns                                                                                                                                                                                          | Constraints and notes                                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `promotion_rule` | `class_level_id`, `min_annual_average`, `required_subject_ids`                                                                                                                                       | `UNIQUE (class_level_id)`. Required subjects must be passed (`grade_band.is_pass`)                                                             |
| `promotion`      | `enrollment_id`, `suggested_decision` (promote, repeat, graduate, withdraw), `decision`, `next_class_level_id`, `next_class_arm_id`, `override_reason`, `decided_by`, `confirmed_by`, `confirmed_at` | `UNIQUE (enrollment_id)`. An override needs a reason. Confirming creates next session's `student_enrollment` and term 1 `enrollment_placement` |

`class_level.next_level_id` gives the next level, and a null `next_level_id` means graduate. There is no hardcoded promotion map. A confirmed `graduate` decision records the student as Graduated, as F0's Graduate class does.

## Invariants

- A teacher writes scores only for sheets matching their `subject_teacher` rows, unless they hold `class.readAll` and `score:record`.
- A submitted or approved sheet is read-only; a published card changes only through an amendment.
- The portal never returns another student's scores or snapshot rows.
- Results are never deleted; superseded snapshots are kept.

## Still open

- How a student who joins mid-term is treated on the card (missing CA as zero, as absent, or excluded from the position).
- Whether an absent exam counts as zero in the average or is flagged and excluded.
- Whether subject positions are shown on the card or only the overall position.
- Report-card print layout and PDF generation.
