import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import {
  APPROVAL_RULES_OFF_MESSAGE,
  APPROVAL_RULES_ON_MESSAGE,
  denialMessage,
  type ApprovalRules,
  type SchoolSettings,
} from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  Badge,
  Button,
  ErrorMessage,
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

const RULE_ROWS: readonly {
  key: keyof ApprovalRules;
  label: string;
  description: string;
}[] = [
  {
    key: 'refund',
    label: 'Refunds',
    description: 'Paying money back to a family that overpaid',
  },
  {
    key: 'writeOff',
    label: 'Cancelling a balance',
    description: 'Giving up on money that will not be paid',
  },
  {
    key: 'creditNote',
    label: 'Reducing a fee',
    description: 'Lowering what a family owes',
  },
  {
    key: 'discount',
    label: 'Discounts',
    description: 'A percentage or amount off future charges',
  },
  {
    key: 'paymentVoid',
    label: 'Cancelling a payment',
    description: 'Undoing a receipt that was recorded wrongly',
  },
];

function useSwitchRule() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: { key: keyof ApprovalRules; on: boolean }) =>
      api.schoolSettings.updateApprovalRules({
        body: { [change.key]: change.on },
      }),
    onSuccess: async (_rules, change) => {
      await invalidateSchool(queryClient);
      toast.success(
        change.on ? APPROVAL_RULES_ON_MESSAGE : APPROVAL_RULES_OFF_MESSAGE
      );
    },
    onError: (error) => {
      toast.error(denialMessage(error, DENIED));
    },
  });
}

function Requests({ settings }: { settings: SchoolSettings }) {
  const canEdit = useCan('schoolAccount', 'update');
  const change = useSwitchRule();
  return (
    <SettingsSection
      title="Requests that need approval"
      description="Switched on, the request waits in Approvals until a boss says yes. Switched off, it goes through straight away. Payments received never wait."
    >
      {RULE_ROWS.map((row) => (
        <SettingsRow
          key={row.key}
          label={row.label}
          description={row.description}
        >
          <Switch
            aria-label={row.label}
            checked={settings.approvalRules[row.key]}
            disabled={!canEdit || change.isPending}
            onCheckedChange={(on) => {
              change.mutate({ key: row.key, on });
            }}
          />
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}

function WhoCanApprove({ approvers }: { approvers: readonly string[] }) {
  const canSeeRoles = useCan('ac', 'read');
  return (
    <SettingsSection
      title="Who can approve"
      description="Only the owner can approve their own request."
    >
      <SettingsRow
        label="Approvers"
        description="Anyone with one of these roles can approve."
        leading={
          <span className="flex flex-wrap gap-1">
            {approvers.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))}
          </span>
        }
      >
        {canSeeRoles ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/roles">
              Change roles
              <ArrowRightIcon />
            </Link>
          </Button>
        ) : undefined}
      </SettingsRow>
    </SettingsSection>
  );
}

export function ApprovalRulesPage() {
  const settings = useQuery(schoolSettingsQueryOptions(useApi()));
  if (settings.isError) {
    return <ErrorMessage error={settings.error} />;
  }
  if (settings.data === undefined) {
    return <PageSkeleton rows={3} />;
  }
  return (
    <section className="flex flex-col gap-4">
      <SettingsHeader
        title="Approval rules"
        description="Choose which money changes need a boss to say yes first."
      />
      <Requests settings={settings.data} />
      <WhoCanApprove approvers={settings.data.approvers} />
    </section>
  );
}
