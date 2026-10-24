import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PaymentMethod,
  ToppedUpWallet,
  TopUpOptions,
  Wallet,
} from '@eduvault/api-contract';
import { generatePaymentReference, walletMoney } from '@eduvault/shared';
import {
  ConfirmDialog,
  ErrorMessage,
  FieldError,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  TextField,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateTopUp, topUpOptionsQueryOptions } from '../../queries';
import {
  announceReplay,
  uploadProofOnce,
  type UploadedProof,
} from '../record-once';
import {
  accountNotice,
  Hint,
  MoneyAccountFields,
  PROOF_ACCEPT,
  SheetActionsFooter,
} from '../recording-parts';
import { useConfirmStep, type ConfirmStep } from '../use-confirm-step';
import {
  confirmDetails,
  initialState,
  toRequest,
  validate,
  withMethod,
  type Receipt,
  type TopUpErrors,
  type TopUpState,
} from './top-up-model';

interface Attempt {
  state: TopUpState;
  file: File | undefined;
}

function announce(topUp: ToppedUpWallet): void {
  if (
    announceReplay(
      topUp,
      (again) =>
        `Reference ${again.reference} was already recorded. Nothing was added twice.`
    )
  ) {
    return;
  }
  toast.success(
    `${walletMoney(topUp.amountMinor, topUp.wallet.currency)} added to ${topUp.wallet.guardian.name}’s wallet.`
  );
}

function useTopUp(
  walletId: string,
  done: {
    onClose: () => void;
    onUploaded: (file: File, id: string) => void;
    uploaded: UploadedProof | undefined;
    options: TopUpOptions;
  }
) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (attempt: Attempt) => {
      const proofFileId = await uploadProofOnce(api, {
        file: attempt.file,
        kind: 'wallet_proof',
        needed: true,
        uploaded: done.uploaded,
        remember: (stored) => {
          done.onUploaded(stored.file, stored.id);
        },
      });
      return api.wallets.topUp({
        params: { walletId },
        body: toRequest(attempt.state, proofFileId ?? ''),
      });
    },
    onSuccess: async (topUp) => {
      await invalidateTopUp(queryClient);
      done.onClose();
      announce(topUp);
    },
  });
}

interface FieldsProps {
  options: TopUpOptions;
  state: TopUpState;
  errors: TopUpErrors;
  onChange: (change: Partial<TopUpState>) => void;
  onMethod: (method: PaymentMethod) => void;
  onFile: (file: File | undefined) => void;
}

function AmountFields({ options, state, errors, onChange }: FieldsProps) {
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
            onChange({ amount: event.target.value });
          }}
        />
        <FieldError message={errors.amount} />
      </div>
      <TextField
        label="Received on"
        name="receivedOn"
        type="date"
        max={options.today}
        value={state.receivedOn}
        onChange={(event) => {
          onChange({ receivedOn: event.target.value });
        }}
      />
    </div>
  );
}

function ReceiptFields({ state, errors, onChange, onFile }: FieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Receipt or proof of payment"
          name="receipt"
          type="file"
          accept={PROOF_ACCEPT}
          aria-invalid={errors.receipt === undefined ? undefined : true}
          onChange={(event) => {
            onFile(event.target.files?.[0]);
          }}
        />
        <Hint>
          A photo of the till slip or bank alert, a screenshot or a PDF. It is
          kept with the top-up.
        </Hint>
        <FieldError message={errors.receipt} />
      </div>
      <TextField
        label="Paid in by (optional)"
        name="depositor"
        placeholder="e.g. an uncle or the school’s sponsor"
        value={state.depositor}
        onChange={(event) => {
          onChange({ depositor: event.target.value });
        }}
      />
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Our reference"
          name="reference"
          className="font-mono"
          value={state.reference}
          aria-invalid={errors.reference === undefined ? undefined : true}
          onChange={(event) => {
            onChange({ reference: event.target.value, referenceTouched: true });
          }}
        />
        <Hint>
          Filled in for you. If the same top-up is entered twice, it is only
          recorded once.
        </Hint>
        <FieldError message={errors.reference} />
      </div>
    </>
  );
}

function ConfirmTopUp({
  options,
  family,
  step,
  pending,
}: {
  options: TopUpOptions;
  family: string;
  step: ConfirmStep<Attempt>;
  pending: boolean;
}) {
  return (
    <ConfirmDialog
      open={step.target !== null}
      title="Add this to the wallet?"
      description="It posts at once. A mistake is put right with a refund, never by editing it."
      details={
        step.target === null
          ? []
          : confirmDetails(options, step.target.state, family)
      }
      confirmLabel="Record top-up"
      pending={pending}
      onConfirm={step.confirm}
      onCancel={step.cancel}
    />
  );
}

function useFormState(options: TopUpOptions) {
  const [state, setState] = useState(() => initialState(options));
  const [file, setFile] = useState<File | undefined>();
  const handlers = {
    onChange: (change: Partial<TopUpState>) => {
      setState((current) => ({ ...current, ...change }));
    },
    onMethod: (method: PaymentMethod) => {
      setState((current) =>
        withMethod(options, current, {
          method,
          fresh: generatePaymentReference(method, options.today),
        })
      );
    },
    onFile: setFile,
  };
  return { state, file, handlers };
}

function TopUpForm({
  fields,
  failure,
  onSubmit,
}: {
  fields: FieldsProps;
  failure: unknown;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      id="record-top-up"
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 overflow-y-auto px-4"
    >
      <AmountFields {...fields} />
      <MoneyAccountFields
        accounts={fields.options.accounts}
        methods={fields.options.methods}
        accountId={fields.state.accountId}
        method={fields.state.method}
        onAccount={(accountId) => {
          fields.onChange({ accountId });
        }}
        onMethod={fields.onMethod}
      />
      <ReceiptFields {...fields} />
      <ErrorMessage error={failure} />
      <FieldError
        message={accountNotice(fields.options.accounts, fields.state.method, {
          none: 'Add a bank or cash account before recording top-ups.',
          unsupported:
            'No account takes this way of paying. Add one in Accounts first.',
        })}
      />
    </form>
  );
}

function SheetForm({
  wallet,
  options,
  onClose,
}: {
  wallet: Wallet;
  options: TopUpOptions;
  onClose: () => void;
}) {
  const { state, file, handlers } = useFormState(options);
  const [submitted, setSubmitted] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedProof>();
  const topUp = useTopUp(wallet.id, {
    onClose,
    onUploaded: (stored, id) => setUploaded({ file: stored, id }),
    uploaded,
    options,
  });
  const step = useConfirmStep<Attempt>((attempt, settled) => {
    topUp.mutate(attempt, { onSettled: settled });
  });
  const receipt: Receipt = { file, uploaded: uploaded !== undefined };
  const errors = submitted ? validate(state, receipt) : {};
  const fields: FieldsProps = { options, state, errors, ...handlers };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(validate(state, receipt)).length === 0) {
      step.ask({ state, file: file ?? uploaded?.file });
    }
  }

  return (
    <>
      <TopUpForm fields={fields} failure={topUp.error} onSubmit={submit} />
      <SheetActionsFooter
        form={{ id: 'record-top-up', label: 'Record top-up' }}
        onClose={onClose}
        pending={topUp.isPending}
        options={options}
        method={state.method}
      />
      <ConfirmTopUp
        options={options}
        family={wallet.guardian.name}
        step={step}
        pending={topUp.isPending}
      />
    </>
  );
}

function SheetBody({
  wallet,
  onClose,
}: {
  wallet: Wallet;
  onClose: () => void;
}) {
  const options = useQuery(topUpOptionsQueryOptions(useApi()));
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
  return <SheetForm wallet={wallet} options={options.data} onClose={onClose} />;
}

export function TopUpSheet({
  wallet,
  open,
  onOpenChange,
}: {
  wallet: Wallet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Record a top-up</SheetTitle>
          <SheetDescription>
            Money {wallet.guardian.name} has paid into the family wallet.
          </SheetDescription>
        </SheetHeader>
        <SheetBody
          wallet={wallet}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
