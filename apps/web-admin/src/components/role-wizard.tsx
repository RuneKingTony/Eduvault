import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRightIcon,
  CheckIcon,
  LockIcon,
  ShieldCheckIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react';
import {
  CAMPUS_REQUIRED,
  type Campus,
  type MemberDetail,
  type SchoolRole,
} from '@eduvault/api-contract';
import { MEMBER_ROLE, OWNER_ROLE } from '@eduvault/policy';
import { toggled } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Label,
  Separator,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateMembers } from '../queries';
import { CampusToggleList } from './campus-toggle-list';
import {
  NoRolesBadge,
  RoleBadge,
  SourceTag,
  WithTooltip,
  listedSlugs,
  permissionCount,
  roleLabelOf,
  roleOf,
} from './member-roles';
import {
  buildWizardModel,
  changeSummary,
  type WizardModel,
  type WizardStep,
} from './role-wizard-model';

interface RoleWizardProps {
  member: MemberDetail;
  roles: readonly SchoolRole[];
  campuses: readonly Campus[];
  canEdit: boolean;
  isSelf: boolean;
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

const CANT_GIVE =
  'It allows things you can’t do yourself, so you can’t give it out';
const CANT_CHANGE = 'You can’t change roles';

const STEP_LABELS: Record<WizardStep, string> = {
  roles: 'Roles',
  campuses: 'Campuses',
  review: 'Review',
};

function Stepper({
  steps,
  current,
}: {
  steps: readonly WizardStep[];
  current: WizardStep;
}) {
  return (
    <ol className="flex items-center gap-2 text-sm">
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={step === current ? 'step' : undefined}
          className={
            step === current
              ? 'font-medium text-foreground'
              : 'text-muted-foreground'
          }
        >
          {index + 1}. {STEP_LABELS[step]}
          {index < steps.length - 1 ? ' →' : ''}
        </li>
      ))}
    </ol>
  );
}

interface RoleRowProps {
  role: SchoolRole;
  checked: boolean;
  disabledReason: string | undefined;
  change: 'Adding' | 'Removing' | undefined;
  onToggle: (checked: boolean) => void;
}

function RoleRow({
  role,
  checked,
  disabledReason,
  change,
  onToggle,
}: RoleRowProps) {
  const id = `role-${role.slug}`;
  return (
    <li className="flex items-start gap-3 py-2">
      <WithTooltip text={disabledReason}>
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabledReason !== undefined}
          onCheckedChange={(value) => {
            onToggle(value === true);
          }}
        />
      </WithTooltip>
      <div className="flex flex-col gap-1">
        <Label htmlFor={id} className="flex flex-wrap items-center gap-2">
          {role.label}
          <SourceTag role={role} />
          {change === undefined ? null : (
            <Badge variant={change === 'Adding' ? 'default' : 'warning'}>
              {change}
            </Badge>
          )}
        </Label>
        {role.description === null ? null : (
          <p className="text-xs text-muted-foreground">{role.description}</p>
        )}
      </div>
    </li>
  );
}

function BuiltInRoles({
  member,
  roles,
}: {
  member: MemberDetail;
  roles: readonly SchoolRole[];
}) {
  const builtIn = [
    ...(member.roles.includes(OWNER_ROLE) ? [OWNER_ROLE] : []),
    MEMBER_ROLE,
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {builtIn.map((slug) => (
          <RoleBadge key={slug} role={roleOf(roles, slug)} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Built-in roles can’t be removed here.
      </p>
      <Separator />
    </div>
  );
}

function ChoiceList({
  model,
  member,
  roles,
  canEdit,
  onToggle,
}: {
  model: WizardModel;
  member: MemberDetail;
  roles: readonly SchoolRole[];
  canEdit: boolean;
  onToggle: (slug: string, checked: boolean) => void;
}) {
  const held = new Set(listedSlugs(member.roles));
  const choices = roles.filter(
    (role) =>
      role.source !== 'code' &&
      (canEdit ? role.grantable || held.has(role.slug) : held.has(role.slug))
  );
  const reasonFor = (role: SchoolRole) => {
    if (!canEdit) {
      return CANT_CHANGE;
    }
    return role.grantable ? undefined : CANT_GIVE;
  };
  if (choices.length === 0) {
    return (
      <div className="flex flex-col gap-1 py-2">
        <p className="font-medium">No other roles</p>
        {canEdit ? (
          <p className="text-sm text-muted-foreground">
            Choose a role to give this person access.
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {choices.map((role) => (
        <RoleRow
          key={role.slug}
          role={role}
          checked={model.draft.includes(role.slug)}
          disabledReason={reasonFor(role)}
          change={
            (model.diff.added.includes(role.slug) && 'Adding') ||
            (model.diff.removed.includes(role.slug) && 'Removing') ||
            undefined
          }
          onToggle={(checked) => {
            onToggle(role.slug, checked);
          }}
        />
      ))}
    </ul>
  );
}

function UnassignableRoles({
  member,
  roles,
}: {
  member: MemberDetail;
  roles: readonly SchoolRole[];
}) {
  const unassignable = roles.filter(
    (role) =>
      role.source !== 'code' &&
      !role.grantable &&
      !member.roles.includes(role.slug)
  );
  if (unassignable.length === 0) {
    return null;
  }
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <LockIcon />
          {unassignable.length} roles you can’t assign
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2">
        <ul className="divide-y">
          {unassignable.map((role) => (
            <RoleRow
              key={role.slug}
              role={role}
              checked={false}
              disabledReason={CANT_GIVE}
              change={undefined}
              onToggle={() => undefined}
            />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          You can only give someone a role if you can already do everything it
          allows.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ComboError({ message }: { message: string | undefined }) {
  if (message === undefined) {
    return null;
  }
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function RolesStep({
  props,
  model,
  onToggle,
  onDiscard,
  onNext,
}: {
  props: RoleWizardProps;
  model: WizardModel;
  onToggle: (slug: string, checked: boolean) => void;
  onDiscard: () => void;
  onNext: () => void;
}) {
  const { member, roles, canEdit } = props;
  return (
    <div className="flex flex-col gap-3">
      <BuiltInRoles member={member} roles={roles} />
      <ChoiceList
        model={model}
        member={member}
        roles={roles}
        canEdit={canEdit}
        onToggle={onToggle}
      />
      {canEdit ? <UnassignableRoles member={member} roles={roles} /> : null}
      <ComboError message={model.combo} />
      {canEdit && model.changed ? (
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-sm text-muted-foreground">
            {changeSummary(model)}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onDiscard}>
              Discard
            </Button>
            <Button
              type="button"
              disabled={model.combo !== undefined}
              onClick={onNext}
            >
              Next
              <ArrowRightIcon />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CampusStep({
  member,
  campuses,
  picked,
  onToggle,
  onBack,
  onNext,
}: {
  member: MemberDetail;
  campuses: readonly Campus[];
  picked: readonly string[];
  onToggle: (campusId: string, on: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const first = member.name.split(' ')[0] ?? member.name;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        Where will {first} work? These roles only apply on the campuses switched
        on here.
      </p>
      <CampusToggleList
        campuses={campuses}
        picked={picked}
        onToggle={onToggle}
        control="switch"
        idPrefix="wizard-campus"
      />
      {picked.length === 0 ? (
        <Alert>
          <AlertDescription>{CAMPUS_REQUIRED}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-between border-t pt-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <WithTooltip
          text={picked.length === 0 ? 'Choose at least one campus' : undefined}
        >
          <Button type="button" disabled={picked.length === 0} onClick={onNext}>
            Next
            <ArrowRightIcon />
          </Button>
        </WithTooltip>
      </div>
    </div>
  );
}

function CapabilityList({
  icon,
  title,
  lines,
}: {
  icon: ReactNode;
  title: string;
  lines: readonly string[];
}) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </p>
      <ul className="list-disc pl-9 text-sm">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function ReviewBadges({
  model,
  roles,
}: {
  model: WizardModel;
  roles: readonly SchoolRole[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {listedSlugs(model.draft).length === 0 ? <NoRolesBadge /> : null}
      {listedSlugs(model.draft).map((slug) => (
        <RoleBadge key={slug} role={roleOf(roles, slug)} />
      ))}
      {model.diff.added.map((slug) => (
        <Badge key={`add-${slug}`}>Adding {roleLabelOf(roles, slug)}</Badge>
      ))}
      {model.diff.removed.map((slug) => (
        <Badge key={`remove-${slug}`} variant="warning">
          Removing {roleLabelOf(roles, slug)}
        </Badge>
      ))}
    </div>
  );
}

function ReviewStep({
  props,
  model,
  picked,
  saving,
  onBack,
  onSave,
}: {
  props: RoleWizardProps;
  model: WizardModel;
  picked: readonly string[];
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  const names = props.campuses
    .filter((campus) => picked.includes(campus.id))
    .map((campus) => campus.name);
  return (
    <div className="flex flex-col gap-3">
      <ReviewBadges model={model} roles={props.roles} />
      <CapabilityList
        icon={<TrendingUpIcon className="size-4 text-success" />}
        title="Will be able to"
        lines={model.gained}
      />
      <CapabilityList
        icon={<TrendingDownIcon className="size-4 text-destructive" />}
        title="Will no longer be able to"
        lines={model.lost}
      />
      <p className="flex items-center gap-2 text-sm">
        {model.needsCampus
          ? `Campuses: ${names.join(', ')}`
          : 'These roles see every campus.'}
        {model.needsCampus && !sameSet(picked, props.member.campusIds) ? (
          <Badge variant="secondary">Changed</Badge>
        ) : null}
      </p>
      <ComboError message={model.combo} />
      <p className="text-xs text-muted-foreground">
        Takes effect on their next request.
      </p>
      <div className="flex justify-between border-t pt-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          disabled={saving || model.combo !== undefined}
          onClick={onSave}
        >
          <CheckIcon />
          Review and save
        </Button>
      </div>
    </div>
  );
}

function useSaveRoles(props: RoleWizardProps, onSaved: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { roles: string[]; campusIds?: string[] }) =>
      api.members.updateRoles({ params: { id: props.member.id }, body }),
    onSuccess: async (saved) => {
      await invalidateMembers(queryClient, props.isSelf);
      toast.success(
        `Saved. ${saved.name} now has ${permissionCount(saved.permissions)} permissions.`
      );
      onSaved();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

function useWizard(props: RoleWizardProps) {
  const { member } = props;
  const [step, setStep] = useState<WizardStep>('roles');
  const [draftRoles, setDraftRoles] = useState<string[] | null>(null);
  const [pickedCampuses, setPickedCampuses] = useState<string[] | null>(null);
  const model = buildWizardModel({
    member,
    catalogue: props.roles,
    draftRoles: draftRoles ?? member.roles,
  });
  const picked = pickedCampuses ?? member.campusIds;
  const reset = () => {
    setDraftRoles(null);
    setPickedCampuses(null);
    setStep('roles');
  };
  const save = useSaveRoles(props, reset);
  return {
    step,
    setStep,
    model,
    picked,
    reset,
    saving: save.isPending,
    toggleRole: (slug: string, checked: boolean) => {
      setDraftRoles(toggled(model.draft, slug, checked));
    },
    toggleCampus: (campusId: string, on: boolean) => {
      setPickedCampuses(toggled(picked, campusId, on));
    },
    save: () => {
      save.mutate({
        roles: listedSlugs(model.draft),
        ...(model.needsCampus ? { campusIds: picked } : {}),
      });
    },
  };
}

function WizardSteps({
  props,
  wizard,
}: {
  props: RoleWizardProps;
  wizard: ReturnType<typeof useWizard>;
}) {
  const { step, setStep, model, picked } = wizard;
  if (!props.canEdit || step === 'roles') {
    return (
      <RolesStep
        props={props}
        model={model}
        onToggle={wizard.toggleRole}
        onDiscard={wizard.reset}
        onNext={() => {
          setStep(model.needsCampus ? 'campuses' : 'review');
        }}
      />
    );
  }
  if (step === 'campuses') {
    return (
      <CampusStep
        member={props.member}
        campuses={props.campuses}
        picked={picked}
        onToggle={wizard.toggleCampus}
        onBack={() => {
          setStep('roles');
        }}
        onNext={() => {
          setStep('review');
        }}
      />
    );
  }
  return (
    <ReviewStep
      props={props}
      model={model}
      picked={picked}
      saving={wizard.saving}
      onBack={() => {
        setStep(model.needsCampus ? 'campuses' : 'roles');
      }}
      onSave={wizard.save}
    />
  );
}

export function RoleWizard(props: RoleWizardProps) {
  const wizard = useWizard(props);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4" />
          Roles
        </CardTitle>
        <CardDescription>
          Someone with more than one role can do everything each role allows.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {props.canEdit ? (
          <Stepper steps={wizard.model.steps} current={wizard.step} />
        ) : null}
        <WizardSteps props={props} wizard={wizard} />
      </CardContent>
    </Card>
  );
}
