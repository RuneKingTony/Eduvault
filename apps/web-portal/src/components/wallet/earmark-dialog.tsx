import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  WALLET_AMOUNT_MESSAGE,
  denialMessage,
  walletEarmarkReleaseOverMessage,
  walletEarmarkSetOverMessage,
  type Wallet,
} from '@eduvault/api-contract';
import {
  generateWalletReference,
  lagosDateOf,
  parseNaira,
  walletMoney,
} from '@eduvault/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  SelectField,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { releaseMutationOptions, setAsideMutationOptions } from '../../queries';

export type EarmarkKind = 'set' | 'release';

const COPY = {
  set: {
    title: 'Set money aside',
    description:
      'Keep part of the wallet for one child’s charges. Nobody else’s fees can use it.',
    action: 'Set aside',
    done: 'set aside',
  },
  release: {
    title: 'Release set-aside money',
    description:
      'Make money kept for one child free for any of the children’s charges again.',
    action: 'Release',
    done: 'released',
  },
} as const;

const DENIED = 'You need permission to change what is set aside.';

function limitOf(wallet: Wallet, kind: EarmarkKind, studentId: string) {
  if (kind === 'set') {
    return {
      limitMinor: Math.max(0, wallet.freeMinor),
      message: walletEarmarkSetOverMessage(wallet.freeMinor),
    };
  }
  const held =
    wallet.children.find((child) => child.studentId === studentId)
      ?.earmarkMinor ?? 0;
  return { limitMinor: held, message: walletEarmarkReleaseOverMessage(held) };
}

function useEarmark(wallet: Wallet, kind: EarmarkKind, onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [reference] = useState(() =>
    generateWalletReference(
      kind === 'set' ? 'setAside' : 'release',
      lagosDateOf(new Date())
    )
  );
  const mutation = useMutation(
    kind === 'set'
      ? setAsideMutationOptions(api, queryClient)
      : releaseMutationOptions(api, queryClient)
  );
  return {
    pending: mutation.isPending,
    send(studentId: string, amountMinor: number) {
      const name = wallet.children.find(
        (row) => row.studentId === studentId
      )?.name;
      mutation.mutate(
        { reference, studentId, amountMinor },
        {
          onSuccess: () => {
            toast.success(
              `${walletMoney(amountMinor, wallet.currency)} ${COPY[kind].done} for ${name ?? 'your child'}.`
            );
            onClose();
          },
          onError: (failure) => {
            toast.error(denialMessage(failure, DENIED));
          },
        }
      );
    },
  };
}

function EarmarkFields({
  options,
  child,
  issue,
  onChild,
}: {
  options: Wallet['children'];
  child: string;
  issue: string | null;
  onChild: (studentId: string) => void;
}) {
  return (
    <>
      <SelectField
        label="Child"
        value={child}
        onChange={(event) => {
          onChild(event.target.value);
        }}
      >
        {options.map((row) => (
          <option key={row.studentId} value={row.studentId}>
            {row.name}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Amount (₦)"
        name="amount"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        aria-invalid={issue !== null}
      />
      <FieldError message={issue} />
    </>
  );
}

function EarmarkForm({
  wallet,
  kind,
  studentId,
  onClose,
}: {
  wallet: Wallet;
  kind: EarmarkKind;
  studentId: string;
  onClose: () => void;
}) {
  const [child, setChild] = useState(studentId);
  const [issue, setIssue] = useState<string | null>(null);
  const earmark = useEarmark(wallet, kind, onClose);
  const copy = COPY[kind];

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseNaira(
      fieldValue(new FormData(event.currentTarget), 'amount')
    );
    const { limitMinor, message } = limitOf(wallet, kind, child);
    if (amountMinor === undefined || amountMinor <= 0) {
      setIssue(WALLET_AMOUNT_MESSAGE);
    } else if (amountMinor > limitMinor) {
      setIssue(message);
    } else {
      setIssue(null);
      earmark.send(child, amountMinor);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription>{copy.description}</DialogDescription>
      </DialogHeader>
      <EarmarkFields
        options={wallet.children}
        child={child}
        issue={issue}
        onChild={(next) => {
          setChild(next);
          setIssue(null);
        }}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={earmark.pending}>
          {copy.action}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EarmarkDialog({
  wallet,
  kind,
  studentId,
  open,
  onClose,
}: {
  wallet: Wallet;
  kind: EarmarkKind;
  studentId: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <EarmarkForm
          wallet={wallet}
          kind={kind}
          studentId={studentId}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
