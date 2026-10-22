# People

Flows: eduvault-e2e M2.4 and M1.3.

### PE-01 · browser · owner

Do: Admit a student through the admission sheet with a new guardian (login kind username).
Expect: the student appears in Students with an admission number; the guardian is linked; the credentials dialog shows once (not screenshotted).

### PE-02 · browser · owner

Do: Open Students, search by name and by admission number, filter by campus.
Expect: results narrow to matches; a Lekki-only bursar sees only Lekki students.

### PE-03 · browser · owner

Do: Open a student's profile and edit a field.
Expect: the change saves and shows after reload; no error toast.

### PE-04 · browser · owner

Do: Graduate a class and archive a student (lifecycle dialogs).
Expect: each asks for confirmation; the student moves to the archived tab and is never deleted.

### PE-05 · api · foreign

Do: As `foreign` request the owner's student and guardian ids.
Expect: 404.

### PE-06 · browser · principal

Do: Request leave as `principal`, then decide it as `owner`.
Expect: the request appears in Approvals as "Leave"; approval updates the member's leave state.
