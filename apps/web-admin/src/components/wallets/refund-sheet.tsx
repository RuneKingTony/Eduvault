import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import type { RefundOptions, Wallet } from '@eduvault/api-contract';
import { walletMoney } from '@eduvault/shared';
import {
  Button,
  ConfirmDialog,
  ErrorMessage,
  FieldError,
  Label,
  NativeSelectOption,
  SelectField,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Textarea,
  TextField,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  invalidateWalletRequest,
  refundOptionsQueryOptions,
} from '../../queries';
import {
  announceWalletRequest,
  uploadProofOnce,
  type UploadedProof,
} from '../record-once';
import { Hint, PROOF_ACCEPT } from '../recording-parts';
import { useConfirmStep, type ConfirmStep } from '../use-confirm-step';
import {
  confirmDetails,
  initialState,
  toRequest,
  validate,
  type RefundEmail,
  type RefundErrors,
  type RefundState,
} from './refund-model';

interface Attempt {
  state: RefundState;
  file: File | undefined;
}

function useRequestRefund(
  walletId: string,
  done: {
    onClose: () => void;
    onUploaded: (file: File, id: string) => void;
    uploaded: UploadedProof | undefined;
  }
) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (attempt: Attempt) => {
      const proofFileId = await uploadProofOnce(api, {
        file: attempt.file,
        kind: 'wallet_refund_request',
        needed: true,
        uploaded: done.uploaded,
        remember: (stored) => {
          done.onUploaded(stored.file, stored.id);
        },
      });
      return api.wallets.requestRefund({
        params: { walletId },
        body: toRequest(attempt.state, proofFileId ?? ''),
      });
    },
    onSuccess: async (made) => {
      await invalidateWalletRequest(queryClient);
      done.onClose();
      announceWalletRequest(made, 'Refund');
    },
  });
}

interface FieldsProps {
  options: RefundOptions;
  state: RefundState;
  errors: RefundErrors;
  freeMinor: number;
  onChange: (change: Partial<RefundState>) => void;
  onFile: (file: File | undefined) => void;
}

const invalid = (message: string | undefined) =>
  message === undefined ? undefined : true;

function AmountFields({
  options,
  state,
  errors,
  freeMinor,
  onChange,
}: FieldsProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Amount to refund (₦)"
          name="amount"
          inputMode="decimal"
          value={state.amount}
          aria-invalid={invalid(errors.amount)}
          onChange={(event) => {
            onChange({ amount: event.target.value });
          }}
        />
        <Hint>{`Up to ${walletMoney(Math.max(0, freeMinor), options.currency)} is free to refund.`}</Hint>
        <FieldError message={errors.amount} />
      </div>
      <SelectField
        label="Paid out of"
        name="accountId"
        value={state.accountId}
        onChange={(event) => {
          onChange({ accountId: event.target.value });
        }}
      >
        {options.accounts.map((account) => (
          <NativeSelectOption key={account.id} value={account.id}>
            {account.label}
          </NativeSelectOption>
        ))}
      </SelectField>
    </div>
  );
}

function ParentFields({ state, errors, onChange, onFile }: FieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Parent’s email address"
          name="email"
          type="email"
          value={state.email}
          aria-invalid={invalid(errors.email)}
          onChange={(event) => {
            onChange({ email: event.target.value });
          }}
        />
        <FieldError message={errors.email} />
      </div>
      <div className="flex flex-col gap-1.5">
        <TextField
          label="The parent’s email, saved as a file"
          name="file"
          type="file"
          accept={PROOF_ACCEPT}
          aria-invalid={invalid(errors.file)}
          onChange={(event) => {
            onFile(event.target.files?.[0]);
          }}
        />
        <Hint>
          A screenshot or PDF of the email asking for the refund. It is kept
          with the request.
        </Hint>
        <FieldError message={errors.file} />
      </div>
    </>
  );
}

function ReasonFields({ state, errors, onChange }: FieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="refund-reason">Reason</Label>
        <Textarea
          id="refund-reason"
          name="reason"
          placeholder="e.g. Paid the term’s fees twice"
          value={state.reason}
          aria-invalid={invalid(errors.reason)}
          onChange={(event) => {
            onChange({ reason: event.target.value });
          }}
        />
        <FieldError message={errors.reason} />
      </div>
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Our reference"
          name="reference"
          className="font-mono"
          value={state.reference}
          aria-invalid={invalid(errors.reference)}
          onChange={(event) => {
            onChange({ reference: event.target.value });
          }}
        />
        <Hint>
          Filled in for you. If the same request is sent twice, it is only
          recorded once.
        </Hint>
        <FieldError message={errors.reference} />
      </div>
    </>
  );
}

function ConfirmRefund({
  options,
  family,
  step,
  pending,
}: {
  options: RefundOptions;
  family: string;
  step: ConfirmStep<Attempt>;
  pending: boolean;
}) {
  return (
    <ConfirmDialog
      open={step.target !== null}
      title="Ask for this refund?"
      description="The money is held back from the family’s wallet until a second person approves or declines it."
      details={
        step.target === null
          ? []
          : confirmDetails(options, step.target.state, family)
      }
      confirmLabel="Request refund"
      pending={pending}
      onConfirm={step.confirm}
      onCancel={step.cancel}
    />
  );
}

function useRefundForm(
  wallet: Wallet,
  options: RefundOptions,
  onClose: () => void
) {
  const [state, setState] = useState(() => initialState(options));
  const [file, setFile] = useState<File | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const [uploaded, setUploaded] = useState<UploadedProof>();
  const request = useRequestRefund(wallet.id, {
    onClose,
    onUploaded: (stored, id) => setUploaded({ file: stored, id }),
    uploaded,
  });
  const step = useConfirmStep<Attempt>((attempt, settled) => {
    request.mutate(attempt, { onSettled: settled });
  });
  const email: RefundEmail = { file, uploaded: uploaded !== undefined };
  const errors = submitted ? validate(state, email, wallet.freeMinor) : {};
  const fields: FieldsProps = {
    options,
    state,
    errors,
    freeMinor: wallet.freeMinor,
    onChange: (change) => {
      setState((current) => ({ ...current, ...change }));
    },
    onFile: setFile,
  };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(validate(state, email, wallet.freeMinor)).length === 0) {
      step.ask({ state, file: file ?? uploaded?.file });
    }
  }

  return { request, step, fields, submit };
}

function RefundFooter({
  disabled,
  onClose,
}: {
  disabled: boolean;
  onClose: () => void;
}) {
  return (
    <SheetFooter>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" form="request-refund" disabled={disabled}>
        <CheckIcon />
        Request refund
      </Button>
    </SheetFooter>
  );
}

function SheetForm({
  wallet,
  options,
  onClose,
}: {
  wallet: Wallet;
  options: RefundOptions;
  onClose: () => void;
}) {
  const { request, step, fields, submit } = useRefundForm(
    wallet,
    options,
    onClose
  );
  const noAccount = options.accounts.length === 0;
  return (
    <>
      <form
        id="request-refund"
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-4 overflow-y-auto px-4"
      >
        <AmountFields {...fields} />
        <ParentFields {...fields} />
        <ReasonFields {...fields} />
        <ErrorMessage error={request.error} />
        <FieldError
          message={
            noAccount
              ? 'Add a bank account before asking for refunds.'
              : undefined
          }
        />
      </form>
      <RefundFooter
        disabled={request.isPending || noAccount}
        onClose={onClose}
      />
      <ConfirmRefund
        options={options}
        family={wallet.guardian.name}
        step={step}
        pending={request.isPending}
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
  const options = useQuery(refundOptionsQueryOptions(useApi()));
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

export function RefundSheet({
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
          <SheetTitle>Request a refund</SheetTitle>
          <SheetDescription>
            Pay money back to {wallet.guardian.name} out of the family wallet. A
            second person approves it.
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
