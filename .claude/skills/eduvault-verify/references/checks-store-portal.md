# Store, dashboard and portal

Flows: eduvault-e2e M4.3, EDU-43, M2.7, M2.8, M3.7.

### SP-01 · browser · owner

Do: Open Store; add an item, record a delivery, count stock.
Expect: stock reflects the delivery; the count shows a variance only after approval.

### SP-02 · browser · bursar

Do: Record a student purchase for Ada and open it on Ada's profile.
Expect: stock drops by the quantity; the purchase lists for Ada; wallet or payment effect matches the sale.

### SP-03 · browser · owner

Do: Open the dashboard.
Expect: Charged, Received and Still owed tiles show numbers consistent with Who owes; a campus-scoped bursar sees only their campus.

### SP-04 · browser · owner

Do: Post an announcement.
Expect: it lists in web-admin and appears for `student` and `guardian` in the portal.

### SP-05 · browser · student

Do: Sign in on :4201 as `student`; open Home, Children, Fees, Purchases, Announcements.
Expect: every page loads with data for Ada only; no create, edit or delete control exists.

### SP-06 · api · student

Do: As `student` send `POST /finance/payments`, `POST /students` and `POST /announcements`.
Expect: 403 for each (the portal is view-only).

### SP-07 · browser · guardian

Do: Sign in on :4201 as `guardian`; switch between Ada and Tobi.
Expect: each child's fees and purchases show for that child only; a child who left loses the school ('tobistudent' check in personas).
