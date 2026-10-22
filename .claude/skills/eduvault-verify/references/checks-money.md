# Payments and money

Flows: eduvault-e2e EDU-37 and M3.4.

### MO-01 · browser · bursar

Do: Record a transfer payment with proof for Ada, split to Ada, submit.
Expect: the receipt opens with "Receipt RCT-… Recorded"; entering it again does not record a second one (same reference answers the same receipt).

### MO-02 · api · bursar

Do: `POST /finance/payments` twice with the same reference and identical body, then once with a different amount.
Expect: the identical call returns the same payment (no second row); the different amount answers 409.

### MO-03 · browser · bursar

Do: Open Who owes and Ada's statement.
Expect: the balance, the owed callout and the statement link render and agree with the receipt.

### MO-04 · browser · owner

Do: Open Money accounts and Money categories; create an account; retire one.
Expect: it lists; retiring asks for confirmation; a retired account no longer appears in Record payment.

### MO-05 · browser · owner

Do: Open Payment rules and Approval rules; change a switch.
Expect: the change saves and survives reload.

### MO-06 · browser · bursar

Do: Request a void for a receipt, decline it as `owner` with a reason.
Expect: the decline needs a reason; the receipt stays Recorded; money is never deleted.

### MO-07 · api · teacher

Do: As `teacher` `POST /finance/payments`.
Expect: 403 `Missing permission ...`.
