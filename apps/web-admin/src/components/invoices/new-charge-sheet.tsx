import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CheckIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import {
  INVOICE_CHARGE_REPLAYED_MESSAGE,
  INVOICE_NO_TERM_MESSAGE,
  oneOffChargeReference,
  type CalendarCurrent,
  type CreateOneOffCharge,
  type FeeType,
} from '@eduvault/api-contract';
import { naira } from '@eduvault/shared';
import {
  Button,
  ErrorMessage,
  FieldError,
  NativeSelectOption,
  SelectField,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  TextField,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  currentTermQueryOptions,
  feeTypesQueryOptions,
  invalidateCharges,
} from '../../queries';
import { StudentPicker } from '../adjustments/student-picker';
import { useToday } from '../calendar/use-today';
import {
  addLine,
  canAddLine,
  canRemoveLine,
  chargeAddedMessage,
  chargeBody,
  chargeTotalMinor,
  hasErrors,
  initialCharge,
  removeLine,
  validateCharge,
  withLine,
  withStudent,
  type ChargeErrors,
  type ChargeLineState,
  type LineErrors,
  type NewChargeState,
} from './new-charge-model';

function useAddCharge(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (body: CreateOneOffCharge) => api.invoices.create({ body }),
    onSuccess: async (charge) => {
      await invalidateCharges(queryClient);
      if (charge.replayed) {
        toast.warning(INVOICE_CHARGE_REPLAYED_MESSAGE);
      } else {
        toast.success(chargeAddedMessage(charge.number));
      }
      onClose();
      await navigate({
        to: '/finance/invoices/$invoiceId',
        params: { invoiceId: charge.id },
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

interface LineRowProps {
  line: ChargeLineState;
  position: number;
  feeTypes: readonly FeeType[];
  errors: LineErrors | undefined;
  removable: boolean;
  onChange: (change: Partial<Omit<ChargeLineState, 'key'>>) => void;
  onRemove: () => void;
}

function FeeAndAmount({
  line,
  feeTypes,
  errors,
  onChange,
}: Pick<LineRowProps, 'line' | 'feeTypes' | 'errors' | 'onChange'>) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <SelectField
          label="Fee type"
          name={`feeType-${line.key}`}
          value={line.feeTypeId}
          onChange={(event) => {
            onChange({ feeTypeId: event.target.value });
          }}
        >
          <NativeSelectOption value="">Choose a fee type</NativeSelectOption>
          {feeTypes.map((type) => (
            <NativeSelectOption key={type.id} value={type.id}>
              {type.name}
            </NativeSelectOption>
          ))}
        </SelectField>
        <FieldError message={errors?.feeType} />
      </div>
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Amount (₦)"
          name={`amount-${line.key}`}
          inputMode="decimal"
          placeholder="15,000"
          value={line.amount}
          onChange={(event) => {
            onChange({ amount: event.target.value });
          }}
        />
        <FieldError message={errors?.amount} />
      </div>
    </div>
  );
}

function LineRow({
  line,
  position,
  feeTypes,
  errors,
  removable,
  onChange,
  onRemove,
}: LineRowProps) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
      <legend className="sr-only">Line {position}</legend>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Line {position}</h3>
        {removable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove line ${position}`}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
      <FeeAndAmount
        line={line}
        feeTypes={feeTypes}
        errors={errors}
        onChange={onChange}
      />
      <div className="flex flex-col gap-1.5">
        <TextField
          label="Description"
          name={`description-${line.key}`}
          placeholder="e.g. School trip"
          value={line.description}
          onChange={(event) => {
            onChange({ description: event.target.value });
          }}
        />
        <FieldError message={errors?.description} />
      </div>
    </fieldset>
  );
}

function LinesField({
  state,
  errors,
  feeTypes,
  onChange,
}: {
  state: NewChargeState;
  errors: ChargeErrors;
  feeTypes: readonly FeeType[];
  onChange: (next: NewChargeState) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {state.lines.map((line, index) => (
        <LineRow
          key={line.key}
          line={line}
          position={index + 1}
          feeTypes={feeTypes}
          errors={errors.lines[line.key]}
          removable={canRemoveLine(state)}
          onChange={(change) => {
            onChange(withLine(state, line.key, change));
          }}
          onRemove={() => {
            onChange(removeLine(state, line.key));
          }}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={!canAddLine(state)}
        onClick={() => {
          onChange(addLine(state));
        }}
      >
        <PlusIcon />
        Add line
      </Button>
      <p className="text-sm font-medium tabular-nums">
        Total: {naira(chargeTotalMinor(state))}
      </p>
    </div>
  );
}

function TermField({ current }: { current: CalendarCurrent }) {
  const { term, schoolYear } = current;
  if (term === null || schoolYear === null) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {INVOICE_NO_TERM_MESSAGE}
      </p>
    );
  }
  return (
    <TextField
      label="Term"
      name="term"
      readOnly
      value={`${term.name}, ${schoolYear.name}`}
    />
  );
}

function useChargeForm(onClose: () => void) {
  const today = useToday();
  const [state, setState] = useState(() =>
    initialCharge(oneOffChargeReference(today, globalThis.crypto.randomUUID()))
  );
  const [errors, setErrors] = useState<ChargeErrors>({ lines: {} });
  const add = useAddCharge(onClose);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (add.isPending) {
      return;
    }
    const found = validateCharge(state);
    setErrors(found);
    if (!hasErrors(found)) {
      add.mutate(chargeBody(state));
    }
  }

  return { state, setState, errors, add, submit };
}

function ChargeForm({
  feeTypes,
  current,
  onClose,
}: {
  feeTypes: readonly FeeType[];
  current: CalendarCurrent;
  onClose: () => void;
}) {
  const { state, setState, errors, add, submit } = useChargeForm(onClose);
  return (
    <>
      <form
        id="new-charge"
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-4 overflow-y-auto px-4"
      >
        <StudentPicker
          value={state.studentId}
          onChange={(studentId) => {
            setState(withStudent(state, studentId));
          }}
        />
        <FieldError message={errors.student} />
        <TermField current={current} />
        <LinesField
          state={state}
          errors={errors}
          feeTypes={feeTypes}
          onChange={setState}
        />
        <ErrorMessage error={add.error} />
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="new-charge"
          disabled={add.isPending || current.term === null}
        >
          <CheckIcon />
          Add charge
        </Button>
      </SheetFooter>
    </>
  );
}

function ChargeBody({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const feeTypes = useQuery(feeTypesQueryOptions(api));
  const current = useQuery(currentTermQueryOptions(api));
  const error = feeTypes.error ?? current.error;
  if (error !== null) {
    return (
      <div className="px-4">
        <ErrorMessage error={error} />
      </div>
    );
  }
  if (feeTypes.data === undefined || current.data === undefined) {
    return (
      <div role="status" aria-label="Loading" className="px-4">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return (
    <ChargeForm
      feeTypes={feeTypes.data}
      current={current.data}
      onClose={onClose}
    />
  );
}

export function NewChargeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>New charge</SheetTitle>
          <SheetDescription>
            Adds a one-off charge to a student’s account. It is sent at once and
            never changes.
          </SheetDescription>
        </SheetHeader>
        <ChargeBody
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
