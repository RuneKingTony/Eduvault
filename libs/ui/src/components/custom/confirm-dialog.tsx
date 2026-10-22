import { useState, type ReactNode, type SubmitEvent } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { ErrorMessage } from './error-message';
import { FieldError } from './field-error';

export interface ConfirmDetail {
  label: string;
  value: ReactNode;
}

export interface ConfirmReason {
  label: string;
  placeholder?: string;
  missing: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  details?: readonly ConfirmDetail[];
  note?: ReactNode;
  icon?: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'destructive';
  reason?: ConfirmReason;
  pending?: boolean;
  error?: unknown;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function Details({ details }: { details: readonly ConfirmDetail[] }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {details.map((detail) => (
        <div key={detail.label} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{detail.label}</dt>
          <dd className="text-right font-semibold">{detail.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReasonField({
  reason,
  value,
  invalid,
  onChange,
}: {
  reason: ConfirmReason;
  value: string;
  invalid: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="confirm-reason">{reason.label}</Label>
      <Textarea
        id="confirm-reason"
        value={value}
        placeholder={reason.placeholder}
        aria-invalid={invalid}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <FieldError message={invalid ? reason.missing : null} />
    </div>
  );
}

function ConfirmFooter({
  confirmLabel,
  icon,
  tone,
  pending,
  onCancel,
}: Pick<ConfirmDialogProps, 'confirmLabel' | 'icon' | 'tone' | 'onCancel'> & {
  pending: boolean;
}) {
  return (
    <DialogFooter>
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        type="submit"
        variant={tone === 'destructive' ? 'destructive' : 'default'}
        disabled={pending}
      >
        {icon ?? <CheckIcon />}
        {confirmLabel}
      </Button>
    </DialogFooter>
  );
}

function ConfirmForm({
  title,
  description,
  details,
  note,
  icon,
  confirmLabel,
  tone,
  reason,
  pending = false,
  error,
  onConfirm,
  onCancel,
}: Omit<ConfirmDialogProps, 'open'>) {
  const [text, setText] = useState('');
  const [tried, setTried] = useState(false);
  const invalid = reason !== undefined && tried && text.trim() === '';

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setTried(true);
    if (reason === undefined || text.trim() !== '') {
      onConfirm(text.trim());
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description === undefined ? null : (
          <DialogDescription>{description}</DialogDescription>
        )}
      </DialogHeader>
      {details === undefined ? null : <Details details={details} />}
      {note === undefined ? null : (
        <p className="rounded-md bg-muted p-3 text-sm">{note}</p>
      )}
      {reason === undefined ? null : (
        <ReasonField
          reason={reason}
          value={text}
          invalid={invalid}
          onChange={setText}
        />
      )}
      <ErrorMessage error={error} />
      <ConfirmFooter
        confirmLabel={confirmLabel}
        icon={icon}
        tone={tone}
        pending={pending}
        onCancel={onCancel}
      />
    </form>
  );
}

export function ConfirmDialog({ open, ...form }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && form.pending !== true) {
          form.onCancel();
        }
      }}
    >
      <DialogContent>
        <ConfirmForm {...form} />
      </DialogContent>
    </Dialog>
  );
}
