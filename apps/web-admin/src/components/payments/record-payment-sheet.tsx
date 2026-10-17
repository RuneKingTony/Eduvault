import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CheckIcon } from 'lucide-react';
import type { RecordedPayment, RecordingOptions } from '@eduvault/api-contract';
import { generatePaymentReference, money } from '@eduvault/shared';
import {
  Button,
  ErrorMessage,
  FieldError,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  toast,
} from '@eduvault/ui';
import { useApi, type Api } from '../../api';
import {
  invalidatePayments,
  recordingOptionsQueryOptions,
} from '../../queries';
import {
  MoneyFields,
  PayerFields,
  ProofField,
  ReferencesDisclosure,
  SplitCard,
  type FieldsProps,
  type SheetActions,
} from './record-payment-fields';
import {
  initialState,
  toRequest,
  validate,
  withAmount,
  withMethod,
  withPayer,
  withShare,
  withStudent,
  type Prefill,
  type SheetErrors,
  type SheetState,
} from './record-payment-model';

interface RecordPaymentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: Prefill;
  stay?: boolean;
}

interface Attempt {
  state: SheetState;
  file: File | undefined;
}

const extraCredit = (payment: RecordedPayment): number =>
  payment.allocations.reduce(
    (sum, row) => sum + Math.max(0, -(row.balanceMinor ?? 0)),
    0
  );

function recordedMessage(payment: RecordedPayment): string {
  const extra = extraCredit(payment);
  const base = `${payment.receiptNumber} recorded: ${money(payment.amountMinor, payment.currency)} from ${payment.payerName}.`;
  return extra > 0
    ? `${base} ${money(extra, payment.currency)} was paid in extra and is kept for the next fees.`
    : base;
}

interface Uploaded {
  file: File;
  id: string;
}

async function proofIdOf(
  api: Api,
  attempt: Attempt,
  remembered: {
    uploaded: Uploaded | undefined;
    remember: (u: Uploaded) => void;
  }
): Promise<string | undefined> {
  const { file, state } = attempt;
  if (state.method !== 'transfer' || file === undefined) {
    return undefined;
  }
  if (remembered.uploaded?.file === file) {
    return remembered.uploaded.id;
  }
  const form = new FormData();
  form.set('kind', 'payment_proof');
  form.set('file', file);
  const stored = await api.files.upload({ body: form });
  remembered.remember({ file, id: stored.id });
  return stored.id;
}

function announce(
  payment: RecordedPayment,
  stay: boolean,
  openReceipt: (paymentId: string, recorded: boolean) => void
): void {
  if (payment.replayed) {
    toast.warning(
      `Reference ${payment.reference} was already recorded as ${payment.receiptNumber}. Nothing was posted twice.`
    );
    openReceipt(payment.id, false);
    return;
  }
  if (stay) {
    toast.success(recordedMessage(payment), {
      action: {
        label: 'View receipt',
        onClick: () => {
          openReceipt(payment.id, false);
        },
      },
    });
    return;
  }
  toast.success(recordedMessage(payment));
  openReceipt(payment.id, true);
}

function useRecord(
  stay: boolean,
  done: {
    onClose: () => void;
    onUploaded: (file: File, id: string) => void;
    uploaded: Uploaded | undefined;
    options: RecordingOptions;
  }
) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const openReceipt = (paymentId: string, recorded: boolean) => {
    void navigate({
      to: '/finance/payments/$paymentId',
      params: { paymentId },
      search: { recorded: recorded ? 1 : undefined },
    });
  };
  return useMutation({
    mutationFn: async (attempt: Attempt) => {
      const proofId = await proofIdOf(api, attempt, {
        uploaded: done.uploaded,
        remember: (stored) => {
          done.onUploaded(stored.file, stored.id);
        },
      });
      return api.payments.record({
        body: toRequest(done.options, attempt.state, proofId),
      });
    },
    onSuccess: async (payment) => {
      await invalidatePayments(queryClient);
      done.onClose();
      announce(payment, stay, openReceipt);
    },
  });
}

function useSheetState(options: RecordingOptions, prefill: Prefill) {
  const [state, setState] = useState(() => initialState(options, prefill));
  const act: SheetActions = {
    patch: (change) => {
      setState((current) => ({ ...current, ...change }));
    },
    payer: (id) => {
      setState((current) => withPayer(options, current, id));
    },
    student: (id) => {
      setState((current) => withStudent(options, current, id));
    },
    amount: (text) => {
      setState((current) => withAmount(options, current, text));
    },
    method: (method) => {
      setState((current) =>
        withMethod(
          current,
          method,
          generatePaymentReference(method, options.today)
        )
      );
    },
    share: (studentId, text) => {
      setState((current) => withShare(current, studentId, text));
    },
  };
  return { state, act };
}

function SheetFields({
  fields,
  onFile,
  failure,
}: {
  fields: FieldsProps;
  onFile: (file: File | undefined) => void;
  failure: unknown;
}) {
  const { options, state, errors, act } = fields;
  return (
    <>
      <PayerFields {...fields} />
      <MoneyFields {...fields} />
      {state.method === 'transfer' ? (
        <ProofField error={errors.proof} onFile={onFile} />
      ) : null}
      <SplitCard {...fields} />
      <ReferencesDisclosure state={state} errors={errors} act={act} />
      <ErrorMessage error={failure} />
      <FieldError
        message={
          options.accounts.length === 0
            ? 'Add a bank, POS or cash account before recording payments.'
            : undefined
        }
      />
    </>
  );
}

function SheetActionsFooter({
  onClose,
  disabled,
}: {
  onClose: () => void;
  disabled: boolean;
}) {
  return (
    <SheetFooter>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" form="record-payment" disabled={disabled}>
        <CheckIcon />
        Record payment
      </Button>
    </SheetFooter>
  );
}

function SheetForm({
  options,
  prefill,
  stay,
  onClose,
}: {
  options: RecordingOptions;
  prefill: Prefill;
  stay: boolean;
  onClose: () => void;
}) {
  const { state, act } = useSheetState(options, prefill);
  const [errors, setErrors] = useState<SheetErrors>({});
  const [file, setFile] = useState<File | undefined>();
  const [uploaded, setUploaded] = useState<{ file: File; id: string }>();
  const record = useRecord(stay, {
    onClose,
    onUploaded: (stored, id) => {
      setUploaded({ file: stored, id });
    },
    uploaded,
    options,
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate(state, { file, uploaded: uploaded !== undefined });
    setErrors(found);
    if (Object.keys(found).length === 0) {
      record.mutate({ state, file: file ?? uploaded?.file });
    }
  }

  return (
    <>
      <form
        id="record-payment"
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-4 overflow-y-auto px-4"
      >
        <SheetFields
          fields={{ options, state, errors, act }}
          onFile={setFile}
          failure={record.error}
        />
      </form>
      <SheetActionsFooter
        onClose={onClose}
        disabled={record.isPending || options.accounts.length === 0}
      />
    </>
  );
}

function SheetBody({
  prefill,
  stay,
  onClose,
}: {
  prefill: Prefill;
  stay: boolean;
  onClose: () => void;
}) {
  const options = useQuery(recordingOptionsQueryOptions(useApi()));
  if (options.isError) {
    return (
      <div className="px-4">
        <ErrorMessage error={options.error} />
      </div>
    );
  }
  if (options.data === undefined) {
    return (
      <div role="status" aria-label="Loading" className="px-4">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return (
    <SheetForm
      options={options.data}
      prefill={prefill}
      stay={stay}
      onClose={onClose}
    />
  );
}

export function RecordPaymentSheet({
  open,
  onOpenChange,
  prefill = {},
  stay = false,
}: RecordPaymentSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Record a payment</SheetTitle>
          <SheetDescription>
            Posts at once and issues a receipt.
          </SheetDescription>
        </SheetHeader>
        <SheetBody
          prefill={prefill}
          stay={stay}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
