import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import {
  RECEIPT_FOOTER_MAX,
  denialMessage,
  updateSchoolSettingsSchema,
  type PaymentMethod,
  type SchoolSettings,
  PAYMENT_METHOD_LABELS,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  Button,
  ErrorMessage,
  FieldError,
  PageSkeleton,
  Switch,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { METHOD_ROWS } from '../components/payments/payment-text';
import {
  SettingsHeader,
  SettingsRow,
  SettingsSection,
} from '../components/settings-page';
import { invalidateSchool, schoolSettingsQueryOptions } from '../queries';

const DENIED = 'You need permission to change school settings.';

function useSwitchMethod() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: { method: PaymentMethod; on: boolean }) =>
      api.schoolSettings.updatePaymentRules({
        body: { [change.method]: change.on },
      }),
    onSuccess: async (_methods, change) => {
      await invalidateSchool(queryClient);
      const label = PAYMENT_METHOD_LABELS[change.method];
      toast.success(
        `${label} is ${change.on ? 'now' : 'no longer'} an option when recording a payment.`
      );
    },
    onError: (error) => {
      toast.error(denialMessage(error, DENIED));
    },
  });
}

function WaysToPay({ settings }: { settings: SchoolSettings }) {
  const canEdit = useCan('schoolAccount', 'update');
  const change = useSwitchMethod();
  return (
    <SettingsSection
      title="Ways to pay"
      description="The choices staff see when they record a payment. Keep at least one switched on."
    >
      {METHOD_ROWS.map((row) => (
        <SettingsRow
          key={row.method}
          label={row.label}
          description={row.description}
        >
          <Switch
            aria-label={row.label}
            checked={settings.paymentMethods[row.method]}
            disabled={!canEdit || change.isPending}
            onCheckedChange={(on) => {
              change.mutate({ method: row.method, on });
            }}
          />
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}

function useSaveFooter() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (receiptFooter: string) =>
      api.schoolSettings.update({ body: { receiptFooter } }),
    onSuccess: async () => {
      await invalidateSchool(queryClient);
      toast.success('Receipt wording saved.');
    },
    onError: (failure) => {
      toast.error(denialMessage(failure, DENIED));
    },
  });
}

function ReceiptWording({ settings }: { settings: SchoolSettings }) {
  const canEdit = useCan('schoolAccount', 'update');
  const [error, setError] = useState<string | undefined>();
  const save = useSaveFooter();

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = updateSchoolSettingsSchema.safeParse({
      receiptFooter: fieldValue(
        new FormData(event.currentTarget),
        'receiptFooter'
      ),
    });
    if (parsed.success) {
      setError(undefined);
      save.mutate(parsed.data.receiptFooter ?? '');
      return;
    }
    setError(parsed.error.issues[0]?.message);
  }

  return (
    <form onSubmit={submit} noValidate>
      <SettingsSection
        title="Receipt wording"
        footer={
          canEdit ? (
            <Button type="submit" disabled={save.isPending}>
              <CheckIcon />
              Save changes
            </Button>
          ) : undefined
        }
      >
        <fieldset disabled={!canEdit} className="flex flex-col gap-1.5">
          <TextField
            key={settings.receiptFooter}
            label="Receipt footer"
            name="receiptFooter"
            maxLength={RECEIPT_FOOTER_MAX + 1}
            defaultValue={settings.receiptFooter}
            aria-invalid={error === undefined ? undefined : true}
          />
          <p className="text-sm text-muted-foreground">
            Printed at the bottom of every receipt.
          </p>
          <FieldError message={error} />
        </fieldset>
      </SettingsSection>
    </form>
  );
}

export function PaymentRulesPage() {
  const api = useApi();
  const settings = useQuery(schoolSettingsQueryOptions(api));
  if (settings.isError) {
    return <ErrorMessage error={settings.error} />;
  }
  if (settings.data === undefined) {
    return <PageSkeleton rows={3} />;
  }
  return (
    <section className="flex flex-col gap-4">
      <SettingsHeader
        title="Payment rules"
        description="How families can pay, and the discounts the school gives."
      />
      <WaysToPay settings={settings.data} />
      <ReceiptWording settings={settings.data} />
    </section>
  );
}
