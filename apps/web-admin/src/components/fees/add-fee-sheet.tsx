import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import {
  FEE_LINE_NAME_MAX,
  type Campus,
  type ClassLevel,
  type FeeGroup,
  type FeeType,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  Button,
  Checkbox,
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
  TextField,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import {
  campusesQueryOptions,
  classLevelsQueryOptions,
  feeTypesQueryOptions,
  invalidateFees,
} from '../../queries';
import {
  EVERY_CAMPUS,
  defaultFeeTypeId,
  feeFormBody,
  type FeeFormResult,
} from './fee-form';
import { APPLIES_TO_LABELS, EVERY_CAMPUS_LABEL, addedToast } from './fee-text';

function useAdd(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Extract<FeeFormResult, { ok: true }>['body']) =>
      api.feeLines.create({ body }),
    onSuccess: async (added) => {
      await invalidateFees(queryClient);
      toast.success(addedToast(added.name));
      onClose();
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

function CampusField({ campuses }: { campuses: readonly Campus[] }) {
  const canReachAll = useCan('campus', 'readAll');
  return (
    <SelectField
      label="Campus"
      name="campusId"
      defaultValue={canReachAll ? EVERY_CAMPUS : (campuses[0]?.id ?? '')}
      hint="A campus line overrides the every-campus line of the same category."
    >
      {canReachAll ? (
        <NativeSelectOption value={EVERY_CAMPUS}>
          {EVERY_CAMPUS_LABEL}
        </NativeSelectOption>
      ) : null}
      {campuses.map((campus) => (
        <NativeSelectOption key={campus.id} value={campus.id}>
          {campus.name}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function OptionalField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="fee-optional"
        checked={checked}
        onCheckedChange={(next) => {
          onChange(next === true);
        }}
      />
      <Label htmlFor="fee-optional" className="flex-col items-start gap-0.5">
        Optional fee
        <span className="text-xs font-normal text-muted-foreground">
          Bus, boarding: billed only to students who opted in.
        </span>
      </Label>
    </div>
  );
}

interface AddFeeData {
  levels: readonly ClassLevel[];
  feeTypes: readonly FeeType[];
  campuses: readonly Campus[];
}

function ChoiceFields({
  levels,
  feeTypes,
  defaultType,
}: Pick<AddFeeData, 'levels' | 'feeTypes'> & { defaultType: string }) {
  return (
    <>
      <SelectField
        label="Level"
        name="classLevelId"
        defaultValue={levels[0]?.id ?? ''}
      >
        {levels.map((level) => (
          <NativeSelectOption key={level.id} value={level.id}>
            {level.name}
          </NativeSelectOption>
        ))}
      </SelectField>
      <SelectField label="Fee type" name="feeTypeId" defaultValue={defaultType}>
        {feeTypes.map((feeType) => (
          <NativeSelectOption key={feeType.id} value={feeType.id}>
            {feeType.name}
          </NativeSelectOption>
        ))}
      </SelectField>
    </>
  );
}

function AmountFields() {
  return (
    <>
      <TextField
        label="Name"
        name="name"
        autoComplete="off"
        maxLength={FEE_LINE_NAME_MAX}
        placeholder="e.g. Excursion to the museum"
      />
      <p className="-mt-2 text-xs text-muted-foreground">
        Parents see this name on the charge.
      </p>
      <TextField
        label="Amount (₦)"
        name="amount"
        inputMode="decimal"
        autoComplete="off"
        placeholder="15,000"
      />
      <SelectField label="Applies to" name="appliesTo" defaultValue="all">
        {Object.entries(APPLIES_TO_LABELS).map(([value, label]) => (
          <NativeSelectOption key={value} value={value}>
            {label}
          </NativeSelectOption>
        ))}
      </SelectField>
    </>
  );
}

function useAddForm(termId: string, onClose: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [optional, setOptional] = useState(false);
  const add = useAdd(onClose);
  return {
    error,
    optional,
    setOptional,
    pending: add.isPending,
    submit: (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      const result = feeFormBody(new FormData(event.currentTarget), {
        termId,
        isOptional: optional,
      });
      if (result.ok) {
        setError(null);
        add.mutate(result.body);
      } else {
        setError(result.message);
      }
    },
  };
}

function SheetForm({
  termId,
  group,
  chipId,
  data,
  onClose,
}: {
  termId: string;
  group: FeeGroup;
  chipId: string | undefined;
  data: AddFeeData;
  onClose: () => void;
}) {
  const form = useAddForm(termId, onClose);
  return (
    <>
      <form
        id="add-fee"
        onSubmit={form.submit}
        noValidate
        className="flex flex-col gap-3 px-4"
      >
        <ChoiceFields
          levels={data.levels}
          feeTypes={data.feeTypes}
          defaultType={defaultFeeTypeId(data.feeTypes, group, chipId)}
        />
        <AmountFields />
        <CampusField campuses={data.campuses} />
        <OptionalField checked={form.optional} onChange={form.setOptional} />
        <FieldError message={form.error} />
      </form>
      <SheetFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="add-fee" disabled={form.pending}>
          <PlusIcon />
          Add a fee
        </Button>
      </SheetFooter>
    </>
  );
}

export function AddFeeSheet({
  open,
  group,
  chipId,
  termId,
  termLabel,
  onOpenChange,
}: {
  open: boolean;
  group: FeeGroup;
  chipId: string | undefined;
  termId: string;
  termLabel: string;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const levels = useQuery({ ...classLevelsQueryOptions(api), enabled: open });
  const feeTypes = useQuery({ ...feeTypesQueryOptions(api), enabled: open });
  const campuses = useQuery({ ...campusesQueryOptions(api), enabled: open });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {group === 'school' ? 'New school fee' : 'New fee'}
          </SheetTitle>
          <SheetDescription>
            For {termLabel}. It applies from the next round of charges.
          </SheetDescription>
        </SheetHeader>
        {levels.data === undefined ||
        feeTypes.data === undefined ||
        campuses.data === undefined ? null : (
          <SheetForm
            termId={termId}
            group={group}
            chipId={chipId}
            data={{
              levels: levels.data,
              feeTypes: feeTypes.data,
              campuses: campuses.data,
            }}
            onClose={() => {
              onOpenChange(false);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
