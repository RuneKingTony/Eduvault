import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon } from 'lucide-react';
import {
  ApiError,
  MAX_GUARDIANS,
  MIN_GUARDIANS,
  denialMessage,
  type SchoolSettings,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  Badge,
  ErrorMessage,
  Input,
  PageSkeleton,
  Switch,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import {
  SettingsHeader,
  SettingsRow,
  SettingsSection,
} from '../components/settings-page';
import { invalidateSchool, schoolSettingsQueryOptions } from '../queries';

const DENIED = 'You need permission to change school settings.';
const SAVE_DELAY_MS = 400;

type Patch = Partial<SchoolSettings>;

function useSaveSettings(onSaved: (settings: SchoolSettings) => string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Patch) => api.schoolSettings.update({ body }),
    onSuccess: async (settings) => {
      await invalidateSchool(queryClient);
      toast.success(onSaved(settings));
    },
    onError: (error) => {
      const refusal =
        error instanceof ApiError ? error.body.issues?.[0]?.message : undefined;
      toast.error(refusal ?? denialMessage(error, DENIED));
    },
  });
}

const guardianCount = (count: number) =>
  `A student can now have up to ${count} guardian${count === 1 ? '' : 's'}.`;

function MostGuardiansRow({ settings }: { settings: SchoolSettings }) {
  const canEdit = useCan('schoolAccount', 'update');
  const [resets, setResets] = useState(0);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = useSaveSettings((saved) => guardianCount(saved.maxGuardians));

  function change(event: ChangeEvent<HTMLInputElement>) {
    const { value } = event.target;
    clearTimeout(pending.current);
    if (value === '') {
      return;
    }
    pending.current = setTimeout(() => {
      save.mutate(
        { maxGuardians: Number(value) },
        {
          onError: () => {
            setResets((count) => count + 1);
          },
        }
      );
    }, SAVE_DELAY_MS);
  }

  return (
    <SettingsRow
      label="Most guardians per student"
      description="Students who already have more keep them."
    >
      <Input
        key={`${settings.maxGuardians}-${resets}`}
        type="number"
        min={MIN_GUARDIANS}
        max={MAX_GUARDIANS}
        step={1}
        className="w-20"
        aria-label="Most guardians per student"
        defaultValue={settings.maxGuardians}
        disabled={!canEdit}
        onChange={change}
      />
    </SettingsRow>
  );
}

function RequireGuardianRow({ settings }: { settings: SchoolSettings }) {
  const canEdit = useCan('schoolAccount', 'update');
  const save = useSaveSettings((saved) =>
    saved.requireGuardian
      ? 'A guardian is now needed to admit a student.'
      : 'A guardian can now be added after admission.'
  );
  return (
    <SettingsRow
      label="Guardian needed to admit"
      description="The admit form asks for at least one guardian. Switch off to add guardians later."
    >
      <Switch
        aria-label="Guardian needed to admit"
        checked={settings.requireGuardian}
        disabled={!canEdit || save.isPending}
        onCheckedChange={(requireGuardian) => {
          save.mutate({ requireGuardian });
        }}
      />
    </SettingsRow>
  );
}

export function AdmissionsPage() {
  const api = useApi();
  const settings = useQuery(schoolSettingsQueryOptions(api));
  if (settings.isError) {
    return <ErrorMessage error={settings.error} />;
  }
  if (settings.data === undefined) {
    return <PageSkeleton rows={2} />;
  }
  return (
    <section className="flex flex-col gap-4">
      <SettingsHeader
        title="Admissions rules"
        description="Rules for admitting students and linking their families."
      />
      <SettingsSection title="Guardians">
        <MostGuardiansRow settings={settings.data} />
        <RequireGuardianRow settings={settings.data} />
      </SettingsSection>
      <SettingsSection title="Logins and numbers">
        <SettingsRow
          label="Portal logins"
          description="Every guardian and student gets a login. They choose their own password the first time they sign in."
        >
          <Badge variant="success">
            <CheckIcon />
            Always on
          </Badge>
        </SettingsRow>
      </SettingsSection>
    </section>
  );
}
