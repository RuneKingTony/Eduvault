# Fees and charges

Flows: eduvault-e2e M3 fee flows.

### FE-01 · browser · owner

Do: Open Finance, School fees; add a fee line for the current term and change its amount.
Expect: the line lists with the amount; the change asks for confirmation and shows in the preview.

### FE-02 · browser · owner

Do: Open Other fees; add and retire an other fee.
Expect: it lists, then shows retired; retiring asks for confirmation.

### FE-03 · browser · bursar

Do: Open Billing; generate a round, review it, send it.
Expect: invoices appear for the students in scope; the send asks for confirmation; cancelling a round marks it cancelled and keeps the rows.

### FE-04 · browser · bursar

Do: Open an invoice and a charge detail.
Expect: lines, totals and the "Student statement" link render; no console error.

### FE-05 · api · bursar2

Do: As `bursar2` request a Lekki invoice.
Expect: 404.
