import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, PlugZapIcon } from 'lucide-react';
import {
  denialMessage,
  saveGatewayConnectionSchema,
  type GatewayConnection,
} from '@eduvault/api-contract';
import { fmtLagosDateTime } from '@eduvault/shared';
import {
  Button,
  ErrorMessage,
  FieldError,
  PageSkeleton,
  SelectField,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  SettingsHeader,
  SettingsRow,
  SettingsSection,
} from '../components/settings-page';
import { gatewayConnectionQueryOptions, invalidateGateway } from '../queries';

const DENIED = 'You need permission to change online payments.';

type Connection = NonNullable<GatewayConnection['connection']>;

function useSave() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.gateway.save,
    onSuccess: async () => {
      await invalidateGateway(queryClient);
      toast.success('Online payments saved. Test the connection next.');
    },
    onError: (failure) => {
      toast.error(denialMessage(failure, DENIED));
    },
  });
}

function KeyField({
  label,
  name,
  mask,
}: {
  label: string;
  name: 'apiKey' | 'secretKey';
  mask: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <TextField
        label={label}
        name={name}
        type="password"
        autoComplete="off"
        placeholder={mask}
      />
      <p className="text-xs text-muted-foreground">
        {mask === undefined
          ? 'Copy it from the Monnify dashboard.'
          : `Saved as ${mask}. Leave blank to keep it.`}
      </p>
    </div>
  );
}

const unlessBlank = (value: string): string | undefined =>
  value === '' ? undefined : value;

function readConnection(data: FormData) {
  return saveGatewayConnectionSchema.safeParse({
    mode: fieldValue(data, 'mode'),
    contractCode: fieldValue(data, 'contractCode'),
    apiKey: unlessBlank(fieldValue(data, 'apiKey')),
    secretKey: unlessBlank(fieldValue(data, 'secretKey')),
  });
}

function ConnectionFields({ current }: { current: Connection | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        label="Mode"
        name="mode"
        defaultValue={current?.mode ?? 'sandbox'}
        hint="Sandbox is for trying it out with test money. Changing the mode needs new keys."
      >
        <option value="sandbox">Sandbox (testing)</option>
        <option value="live">Live</option>
      </SelectField>
      <TextField
        label="Contract code"
        name="contractCode"
        autoComplete="off"
        defaultValue={current?.contractCode ?? ''}
      />
      <KeyField label="API key" name="apiKey" mask={current?.apiKeyMask} />
      <KeyField
        label="Secret key"
        name="secretKey"
        mask={current?.secretKeyMask}
      />
    </div>
  );
}

function ConnectionForm({ current }: { current: Connection | null }) {
  const [error, setError] = useState<string | undefined>();
  const save = useSave();

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = readConnection(new FormData(event.currentTarget));
    if (parsed.success) {
      setError(undefined);
      save.mutate({ body: parsed.data });
      return;
    }
    setError(parsed.error.issues[0]?.message);
  }

  return (
    <form key={current?.updatedAt ?? 'new'} onSubmit={submit} noValidate>
      <SettingsSection
        title="Monnify"
        description="The school’s own Monnify account. Families’ bank transfers go to it, and each payment is confirmed with Monnify before it reaches a wallet."
        footer={
          <Button type="submit" disabled={save.isPending}>
            <CheckIcon />
            Save connection
          </Button>
        }
      >
        <ConnectionFields current={current} />
        <FieldError message={error} />
      </SettingsSection>
    </form>
  );
}

function useTest() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.gateway.test({}),
    onSuccess: async (result) => {
      await invalidateGateway(queryClient);
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: (failure) => {
      toast.error(denialMessage(failure, DENIED));
    },
  });
}

function lastTest(current: Connection): string {
  if (current.lastTestedAt === null) {
    return 'Not tested yet.';
  }
  const when = fmtLagosDateTime(current.lastTestedAt);
  return current.lastTestOk === true
    ? `Connected when tested on ${when}.`
    : `The last test failed on ${when}.`;
}

function TestConnection({ current }: { current: Connection | null }) {
  const test = useTest();
  return (
    <SettingsSection title="Test the connection">
      <SettingsRow
        label="Check the keys with Monnify"
        description={
          current === null ? 'Save the connection first.' : lastTest(current)
        }
      >
        <Button
          type="button"
          variant="outline"
          disabled={current === null || test.isPending}
          onClick={() => {
            test.mutate();
          }}
        >
          <PlugZapIcon />
          Test connection
        </Button>
      </SettingsRow>
    </SettingsSection>
  );
}

function WebhookUrl({ url }: { url: string }) {
  return (
    <SettingsSection
      title="Webhook"
      description="In the Monnify dashboard, set this as the transaction completion URL, and allow Monnify’s IP addresses to reach it."
    >
      <TextField
        label="Webhook URL"
        readOnly
        value={url}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
      />
    </SettingsSection>
  );
}

export function OnlinePaymentsPage() {
  const gateway = useQuery(gatewayConnectionQueryOptions(useApi()));
  if (gateway.isError) {
    return <ErrorMessage error={gateway.error} />;
  }
  if (gateway.data === undefined) {
    return <PageSkeleton rows={3} />;
  }
  return (
    <section className="flex flex-col gap-4">
      <SettingsHeader
        title="Online payments"
        description="Let families pay into their wallet by bank transfer through Monnify."
      />
      <ConnectionForm current={gateway.data.connection} />
      <TestConnection current={gateway.data.connection} />
      <WebhookUrl url={gateway.data.webhookUrl} />
    </section>
  );
}
