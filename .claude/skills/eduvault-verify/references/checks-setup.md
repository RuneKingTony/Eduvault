# School set-up

Flows: eduvault-e2e M2.1, M2.2, M2.3.

### SE-01 · browser · owner

Do: Open Settings, School profile; change the school name and save.
Expect: the new name shows in the header; the old name is gone after reload.

### SE-02 · browser · owner

Do: Open Calendar; start a school year with terms; make a term current.
Expect: the year and terms list; exactly one term is current.

### SE-03 · browser · owner

Do: Open Campuses and create a campus; open the campus switcher.
Expect: the campus appears in the list and the switcher; the creator is enrolled.

### SE-04 · browser · owner

Do: Open Classes, create a class on a level and campus; open it.
Expect: the class page loads with its level, campus and an empty roll.

### SE-05 · browser · owner

Do: Open Settings, Levels and Subjects; add a subject and assign a teacher to a class (flows: EDU-40).
Expect: the subject lists; the "You" badge shows for the signed-in teacher; a subject off the class level is refused with 400.

### SE-06 · api · foreign

Do: As `foreign` request the owner's campus, class and year ids.
Expect: 404.
