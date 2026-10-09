import { useState, type SubmitEvent } from 'react';
import { EyeIcon, LogOutIcon } from 'lucide-react';
import { ACTING_REASON_MAX_LENGTH } from '@eduvault/api-contract';
import { Button, Input, Label, fieldValue } from '@eduvault/ui';
import { useActingActions } from '../acting-actions';
import { useActing, type ActingState } from '../acting-store';

function ReasonForm({ onAllow }: { onAllow: (reason: string) => void }) {
  const [blank, setBlank] = useState(true);
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = fieldValue(new FormData(event.currentTarget), 'reason');
    if (reason.trim() !== '') {
      onAllow(reason);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Label htmlFor="acting-reason" className="sr-only">
        Reason for writes
      </Label>
      <Input
        id="acting-reason"
        name="reason"
        required
        maxLength={ACTING_REASON_MAX_LENGTH}
        placeholder="Reason, e.g. SUP-2214"
        className="h-8 w-56 bg-background"
        onChange={(event) => {
          setBlank(event.currentTarget.value.trim() === '');
        }}
      />
      <Button type="submit" size="sm" disabled={blank}>
        Allow writes
      </Button>
    </form>
  );
}

function Summary({ acting }: { acting: ActingState }) {
  return (
    <div role="status" className="flex min-w-0 flex-col leading-tight">
      <span className="truncate font-medium">
        Acting in {acting.schoolName}
      </span>
      <span className="text-xs text-muted-foreground">
        {acting.reason === null
          ? 'Read-only. Every request is audited.'
          : `Writes allowed. Reason ${acting.reason}`}
      </span>
    </div>
  );
}

export function ActingBanner() {
  const acting = useActing();
  const actions = useActingActions();
  if (acting === null) {
    return null;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-warning/25 px-4 py-2 text-warning-ink">
      <div className="flex min-w-0 items-center gap-2">
        <EyeIcon aria-hidden className="size-4 shrink-0" />
        <Summary acting={acting} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {acting.reason === null ? (
          <ReasonForm onAllow={actions.allow} />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-foreground"
            onClick={actions.back}
          >
            Back to read-only
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-foreground"
          onClick={actions.leave}
        >
          <LogOutIcon />
          Leave school
        </Button>
      </div>
    </div>
  );
}
