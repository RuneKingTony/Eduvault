import { ChevronDownIcon } from 'lucide-react';
import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type RecordingOptions,
} from '@eduvault/api-contract';
import { PAYMENT_METHODS, countOf, money, splitLine } from '@eduvault/shared';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  FieldError,
  Input,
  Label,
  NativeSelectOption,
  SelectField,
  TextField,
  cn,
} from '@eduvault/ui';
import {
  SOMEONE_ELSE,
  amountOf,
  childrenFor,
  owedTotal,
  splitTotal,
  accountsFor,
  type SheetErrors,
  type SheetState,
} from './record-payment-model';

export interface SheetActions {
  patch: (change: Partial<SheetState>) => void;
  payer: (id: string) => void;
  student: (id: string) => void;
  amount: (text: string) => void;
  method: (method: PaymentMethod) => void;
  share: (studentId: string, text: string) => void;
}

export interface FieldsProps {
  options: RecordingOptions;
  state: SheetState;
  errors: SheetErrors;
  act: SheetActions;
}

const Hint = ({ children }: { children: string }) => (
  <p className="text-xs text-muted-foreground">{children}</p>
);

export function PayerFields({ options, state, errors, act }: FieldsProps) {
  return (
    <>
      <SelectField
        label="Payer"
        name="payer"
        hint="Pick a guardian to prefill each child’s outstanding balance."
        value={state.payer}
        onChange={(event) => {
          act.payer(event.target.value);
        }}
      >
        {options.payers.map((payer) => (
          <NativeSelectOption key={payer.guardianId} value={payer.guardianId}>
            {payer.name} ({countOf(payer.children.length, 'child', 'children')})
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={SOMEONE_ELSE}>
          Someone else
        </NativeSelectOption>
      </SelectField>
      {state.payer === SOMEONE_ELSE ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <TextField
              label="Payer name"
              name="payerName"
              placeholder="e.g. Mrs Ojo"
              value={state.payerName}
              aria-invalid={errors.payerName === undefined ? undefined : true}
              onChange={(event) => {
                act.patch({ payerName: event.target.value });
              }}
            />
            <FieldError message={errors.payerName} />
          </div>
          <SelectField
            label="Student"
            name="studentId"
            value={state.studentId}
            onChange={(event) => {
              act.student(event.target.value);
            }}
          >
            {options.students.map((student) => (
              <NativeSelectOption
                key={student.studentId}
                value={student.studentId}
              >
                {student.name} · {student.admissionNumber}
              </NativeSelectOption>
            ))}
          </SelectField>
        </div>
      ) : null}
    </>
  );
}

function AmountFields({ options, state, errors, act }: FieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Amount received (₦)"
          name="amount"
          inputMode="decimal"
          value={state.amount}
          aria-invalid={errors.amount === undefined ? undefined : true}
          onChange={(event) => {
            act.amount(event.target.value);
          }}
        />
        <Hint>Part payments are fine: enter what was actually paid.</Hint>
        <FieldError message={errors.amount} />
      </div>
      <TextField
        label="Paid on"
        name="paidOn"
        type="date"
        max={options.today}
        value={state.paidOn}
        onChange={(event) => {
          act.patch({ paidOn: event.target.value });
        }}
      />
    </div>
  );
}

function AccountFields({ options, state, act }: FieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label="Into"
        name="accountId"
        value={state.accountId}
        onChange={(event) => {
          act.patch({ accountId: event.target.value });
        }}
      >
        {accountsFor(options.accounts, state.method).map((account) => (
          <NativeSelectOption key={account.id} value={account.id}>
            {account.label}
          </NativeSelectOption>
        ))}
      </SelectField>
      <SelectField
        label="How they paid"
        name="method"
        value={state.method}
        onChange={(event) => {
          act.method(event.target.value as PaymentMethod);
        }}
      >
        {PAYMENT_METHODS.filter((method) => options.methods[method]).map(
          (method) => (
            <NativeSelectOption key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </NativeSelectOption>
          )
        )}
      </SelectField>
    </div>
  );
}

export function MoneyFields(props: FieldsProps) {
  return (
    <>
      <AmountFields {...props} />
      <AccountFields {...props} />
    </>
  );
}

export function ProofField({
  error,
  onFile,
}: {
  error: string | undefined;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <TextField
        label="Proof of transfer (needed for bank transfers)"
        name="proof"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf,.heic"
        aria-invalid={error === undefined ? undefined : true}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
        }}
      />
      <Hint>
        A photo, a screenshot from WhatsApp or the bank app, or a PDF. It is
        kept with the receipt.
      </Hint>
      <FieldError message={error} />
    </div>
  );
}

export function SplitCard({ options, state, errors, act }: FieldsProps) {
  const children = childrenFor(options, state);
  const line = splitLine({
    splitMinor: splitTotal(state),
    amountMinor: amountOf(state),
    owedMinor: owedTotal(options, state),
    currency: options.currency,
  });
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
      <legend className="sr-only">Split across children</legend>
      <div>
        <p className="font-medium">Split across children</p>
        <p className="text-sm text-muted-foreground">
          One receipt. Share the amount between the children below.
        </p>
      </div>
      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No children in your scope.
        </p>
      ) : (
        children.map((child) => (
          <div key={child.studentId} className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <Label htmlFor={`share-${child.studentId}`}>{child.name}</Label>
              <span className="text-xs text-muted-foreground">
                owes {money(Math.max(0, child.owesMinor), options.currency)}
              </span>
            </div>
            <Input
              id={`share-${child.studentId}`}
              className="w-32"
              inputMode="decimal"
              aria-label={`Amount for ${child.name}`}
              value={state.shares[child.studentId] ?? ''}
              onChange={(event) => {
                act.share(child.studentId, event.target.value);
              }}
            />
          </div>
        ))
      )}
      <p
        role="status"
        className={cn(
          'text-sm',
          line.matches ? 'text-success' : 'text-destructive'
        )}
      >
        {line.text}
      </p>
      <FieldError message={errors.split} />
    </fieldset>
  );
}

export function ReferencesDisclosure({
  state,
  errors,
  act,
}: Omit<FieldsProps, 'options'>) {
  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium">
        References · {state.reference}
        <ChevronDownIcon className="size-4" />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 px-4 pb-4">
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Bank or POS reference"
            name="providerReference"
            placeholder="e.g. GTB/FT/2610070031"
            value={state.providerReference}
            onChange={(event) => {
              act.patch({ providerReference: event.target.value });
            }}
          />
          <Hint>Optional. The number on the bank alert or POS slip.</Hint>
        </div>
        <div className="flex flex-col gap-1.5">
          <TextField
            label="Our reference"
            name="reference"
            className="font-mono"
            value={state.reference}
            aria-invalid={errors.reference === undefined ? undefined : true}
            onChange={(event) => {
              act.patch({
                reference: event.target.value,
                referenceTouched: true,
              });
            }}
          />
          <Hint>
            Filled in for you. If the same payment is entered twice, it is only
            recorded once.
          </Hint>
          <FieldError message={errors.reference} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
