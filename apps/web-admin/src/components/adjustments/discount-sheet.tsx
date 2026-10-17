import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { SendIcon } from 'lucide-react';
import {
  DISCOUNT_APPLIED_MESSAGE,
  DISCOUNT_SUBMITTED_MESSAGE,
  type DiscountKind,
  type FeeType,
} from '@eduvault/api-contract';
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
import { StudentPicker } from './student-picker';
import {
  discountTermsQueryOptions,
  feeTypesQueryOptions,
  invalidateApprovals,
} from '../../queries';
import {
  WHOLE_CHARGE,
  toDiscountBody,
  validateDiscount,
  type DiscountErrors,
  type DiscountState,
} from './discount-model';
import { ReasonField } from './request-fields';
import {
  defaultFrom,
  fromOptions,
  untilOptions,
  type TermOption,
} from './term-options';

const KIND_LABELS: Record<DiscountKind, string> = {
  percent: 'Percentage',
  fixed: 'Fixed amount (₦)',
};

export function feeTypeOrder(types: readonly FeeType[]): FeeType[] {
  return types.toSorted((a, b) => {
    const tuition = Number(b.name === 'Tuition') - Number(a.name === 'Tuition');
    return tuition === 0 ? a.code - b.code : tuition;
  });
}

function useCreateDiscount(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (state: DiscountState) =>
      api.studentDiscounts.create({ body: toDiscountBody(state) }),
    onSuccess: async (made) => {
      await invalidateApprovals(queryClient);
      onClose();
      if (made.autoApproved) {
        toast.success(DISCOUNT_APPLIED_MESSAGE);
        return;
      }
      toast.success(DISCOUNT_SUBMITTED_MESSAGE, {
        action: {
          label: 'Approvals inbox',
          onClick: () => {
            void navigate({ to: '/approvals' });
          },
        },
      });
    },
  });
}

interface FieldProps {
  state: DiscountState;
  errors: DiscountErrors;
  patch: (change: Partial<DiscountState>) => void;
}

function ValueFields({ state, errors, patch }: FieldProps) {
  return (
    <>
      <StudentPicker
        value={state.studentId}
        onChange={(studentId) => {
          patch({ studentId });
        }}
      />
      <SelectField
        label="Kind"
        name="kind"
        value={state.kind}
        onChange={(event) => {
          patch({
            kind: event.target.value === 'fixed' ? 'fixed' : 'percent',
          });
        }}
      >
        <NativeSelectOption value="percent">
          {KIND_LABELS.percent}
        </NativeSelectOption>
        <NativeSelectOption value="fixed">
          {KIND_LABELS.fixed}
        </NativeSelectOption>
      </SelectField>
      <TextField
        label="Value"
        name="value"
        inputMode="decimal"
        placeholder="10 or 15,000"
        value={state.value}
        onChange={(event) => {
          patch({ value: event.target.value });
        }}
      />
      <FieldError message={errors.student ?? errors.value} />
    </>
  );
}

function FeeTypeField({
  feeTypes,
  state,
  patch,
}: Pick<FieldProps, 'state' | 'patch'> & { feeTypes: readonly FeeType[] }) {
  return (
    <SelectField
      label="Applies to"
      name="feeType"
      value={state.feeTypeId}
      onChange={(event) => {
        patch({ feeTypeId: event.target.value });
      }}
    >
      {feeTypeOrder(feeTypes).map((type) => (
        <NativeSelectOption key={type.id} value={type.id}>
          {type.name}
        </NativeSelectOption>
      ))}
      <NativeSelectOption value={WHOLE_CHARGE}>Whole charge</NativeSelectOption>
    </SelectField>
  );
}

function TermFields({
  feeTypes,
  terms,
  state,
  errors,
  patch,
}: FieldProps & {
  feeTypes: readonly FeeType[];
  terms: readonly TermOption[];
}) {
  return (
    <>
      <FeeTypeField feeTypes={feeTypes} state={state} patch={patch} />
      <SelectField
        label="From"
        name="from"
        value={state.fromTermId}
        onChange={(event) => {
          patch({ fromTermId: event.target.value, toTermId: '' });
        }}
      >
        {fromOptions(terms).map((term) => (
          <NativeSelectOption key={term.id} value={term.id}>
            {term.label}
          </NativeSelectOption>
        ))}
      </SelectField>
      <SelectField
        label="Until"
        name="until"
        value={state.toTermId}
        onChange={(event) => {
          patch({ toTermId: event.target.value });
        }}
      >
        <NativeSelectOption value="">No end</NativeSelectOption>
        {untilOptions(terms, state.fromTermId).map((term) => (
          <NativeSelectOption key={term.id} value={term.id}>
            {term.label}
          </NativeSelectOption>
        ))}
      </SelectField>
      <FieldError message={errors.until} />
    </>
  );
}

function useDiscountForm(
  options: { feeTypes: readonly FeeType[]; terms: readonly TermOption[] },
  onClose: () => void
) {
  const [state, setState] = useState<DiscountState>(() => ({
    studentId: '',
    kind: 'percent',
    value: '',
    feeTypeId: feeTypeOrder(options.feeTypes)[0]?.id ?? WHOLE_CHARGE,
    fromTermId: defaultFrom(options.terms),
    toTermId: '',
    reason: '',
  }));
  const [errors, setErrors] = useState<DiscountErrors>({});
  const create = useCreateDiscount(onClose);
  const patch = (change: Partial<DiscountState>) => {
    setState((current) => ({ ...current, ...change }));
  };

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const order = options.terms.map((term) => term.id);
    const untilBeforeFrom =
      order.indexOf(state.toTermId) < order.indexOf(state.fromTermId);
    const found = validateDiscount(state, untilBeforeFrom);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      create.mutate(state);
    }
  }

  return { state, errors, patch, submit, create };
}

function DiscountForm({
  feeTypes,
  terms,
  onClose,
}: {
  feeTypes: readonly FeeType[];
  terms: readonly TermOption[];
  onClose: () => void;
}) {
  const { state, errors, patch, submit, create } = useDiscountForm(
    { feeTypes, terms },
    onClose
  );
  const fields = { state, errors, patch };
  return (
    <>
      <form
        id="new-discount"
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-4 overflow-y-auto px-4"
      >
        <ValueFields {...fields} />
        <TermFields {...fields} feeTypes={feeTypes} terms={terms} />
        <ReasonField
          value={state.reason}
          error={errors.reason}
          placeholder="e.g. Staff child"
          onChange={(reason) => {
            patch({ reason });
          }}
        />
        <ErrorMessage error={create.error} />
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="new-discount" disabled={create.isPending}>
          <SendIcon />
          Submit for approval
        </Button>
      </SheetFooter>
    </>
  );
}

function DiscountBody({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const feeTypes = useQuery(feeTypesQueryOptions(api));
  const choices = useQuery(discountTermsQueryOptions(api));
  if (choices.data === undefined || feeTypes.data === undefined) {
    return (
      <div role="status" aria-label="Loading" className="px-4">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return (
    <DiscountForm
      feeTypes={feeTypes.data}
      terms={choices.data}
      onClose={onClose}
    />
  );
}

export function DiscountSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>New student discount</SheetTitle>
          <SheetDescription>
            Applies at the next round of charges once approved.
          </SheetDescription>
        </SheetHeader>
        <DiscountBody
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
