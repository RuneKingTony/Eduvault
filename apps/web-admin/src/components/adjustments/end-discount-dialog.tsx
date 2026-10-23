import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StudentDiscount } from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  NativeSelectOption,
  SelectField,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { discountTermsQueryOptions, invalidateApprovals } from '../../queries';
import { discountBadge } from './adjustment-text';
import { endOptions, type TermOption } from './term-options';

function useEnd(onClose: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attempt: { discount: StudentDiscount; lastTermId: string }) =>
      api.studentDiscounts.end({
        params: { id: attempt.discount.id },
        body: { lastTermId: attempt.lastTermId },
      }),
    onSuccess: async (ended) => {
      await invalidateApprovals(queryClient);
      toast.success(
        `Discount ended. It last applies in ${ended.toTerm?.name ?? 'the term you chose'}.`
      );
      onClose();
    },
  });
}

function LastTermField({
  options,
  value,
  onChange,
}: {
  options: readonly TermOption[];
  value: string;
  onChange: (termId: string) => void;
}) {
  return (
    <SelectField
      label="Last term it applies to"
      name="lastTerm"
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      {options.map((term) => (
        <NativeSelectOption key={term.id} value={term.id}>
          {term.label}
        </NativeSelectOption>
      ))}
    </SelectField>
  );
}

function EndForm({
  discount,
  currency,
  onClose,
}: {
  discount: StudentDiscount;
  currency: string;
  onClose: () => void;
}) {
  const choices = useQuery(discountTermsQueryOptions(useApi()));
  const options = endOptions(
    choices.data ?? [],
    discount.toTerm?.id ?? null,
    discount.fromTerm.id
  );
  const [chosen, setChosen] = useState('');
  const lastTermId = chosen === '' ? (options[0]?.id ?? '') : chosen;
  const end = useEnd(onClose);
  return (
    <>
      <DialogHeader>
        <DialogTitle>End this discount?</DialogTitle>
        <DialogDescription>
          {discount.student.name} · {discountBadge(discount, currency)}
        </DialogDescription>
      </DialogHeader>
      <LastTermField
        options={options}
        value={lastTermId}
        onChange={setChosen}
      />
      <p className="text-sm text-muted-foreground">
        Charges already sent don’t change. Later charges no longer get this
        discount.
      </p>
      <ErrorMessage error={end.error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={end.isPending || lastTermId === ''}
          onClick={() => {
            end.mutate({ discount, lastTermId });
          }}
        >
          End discount
        </Button>
      </DialogFooter>
    </>
  );
}

export function EndDiscountDialog({
  discount,
  currency,
  onClose,
}: {
  discount: StudentDiscount | null;
  currency: string;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={discount !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        {discount === null ? null : (
          <EndForm discount={discount} currency={currency} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
