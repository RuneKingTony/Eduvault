import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRoundIcon, TriangleAlertIcon, Trash2Icon } from 'lucide-react';
import type { HandoverCandidate } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import {
  Alert,
  AlertDescription,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  ErrorMessage,
  Label,
  NativeSelect,
  NativeSelectOption,
} from '@eduvault/ui';
import { useApi } from '../api';
import { DeleteSchoolDialog } from '../components/delete-school-dialog';
import { HandoverDialog } from '../components/handover-dialog';
import { WithTooltip } from '../components/member-roles';
import {
  SettingsHeader,
  SettingsRow,
  SettingsSection,
} from '../components/settings-page';
import {
  deletableQueryOptions,
  handoverCandidatesQueryOptions,
  schoolProfileQueryOptions,
} from '../queries';

function NewOwnerField({
  candidates,
  selected,
  onChange,
}: {
  candidates: readonly HandoverCandidate[];
  selected: HandoverCandidate;
  onChange: (userId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="new-owner">New owner</Label>
      <NativeSelect
        id="new-owner"
        className="w-full sm:w-80"
        value={selected.userId}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {candidates.map((entry) => (
          <NativeSelectOption key={entry.userId} value={entry.userId}>
            {entry.title === null
              ? entry.name
              : `${entry.name} · ${entry.title}`}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p className="text-sm text-muted-foreground">
        If they are an administrator or principal, owner replaces that role.
      </p>
    </div>
  );
}

function HandoverButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <WithTooltip text={disabled ? 'Add another staff member first' : undefined}>
      <Button
        type="button"
        variant="destructive"
        disabled={disabled}
        onClick={onClick}
      >
        <KeyRoundIcon />
        Hand over the school…
      </Button>
    </WithTooltip>
  );
}

function HandoverSection({ onHandedOver }: { onHandedOver: () => void }) {
  const api = useApi();
  const candidates = useQuery(handoverCandidatesQueryOptions(api));
  const [chosen, setChosen] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const list = candidates.data ?? [];
  const selected = list.find((entry) => entry.userId === chosen) ?? list[0];
  return (
    <SettingsSection
      title="Hand over the school"
      description="Make someone else the owner. You stay on the staff list but stop being the owner."
      footer={
        <HandoverButton
          disabled={selected === undefined}
          onClick={() => {
            setConfirming(true);
          }}
        />
      }
    >
      <ErrorMessage error={candidates.error} />
      {candidates.isSuccess && list.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Nobody to hand it to</EmptyTitle>
            <EmptyDescription>Add another staff member first.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {selected === undefined ? null : (
        <NewOwnerField
          candidates={list}
          selected={selected}
          onChange={setChosen}
        />
      )}
      {selected === undefined ? null : (
        <HandoverDialog
          key={selected.userId}
          candidate={selected}
          open={confirming}
          onOpenChange={setConfirming}
          onHandedOver={onHandedOver}
        />
      )}
    </SettingsSection>
  );
}

function DeleteSection({ onDeleted }: { onDeleted: () => void }) {
  const api = useApi();
  const deletable = useQuery(deletableQueryOptions(api));
  const profile = useQuery(schoolProfileQueryOptions(api));
  const [confirming, setConfirming] = useState(false);
  const blocked = deletable.data?.ok !== true;
  return (
    <SettingsSection
      title="Delete the school"
      description="Students, payments and results are never deleted, so a school with records can’t be deleted."
      danger
    >
      <ErrorMessage error={deletable.error} />
      <SettingsRow
        label="Delete this school now"
        description="Not allowed while the school has students or money records."
      >
        <WithTooltip
          text={
            deletable.data?.ok === false ? deletable.data.reason : undefined
          }
        >
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={blocked || profile.data === undefined}
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Trash2Icon />
            Delete school
          </Button>
        </WithTooltip>
      </SettingsRow>
      {profile.data === undefined ? null : (
        <DeleteSchoolDialog
          schoolName={profile.data.name}
          open={confirming}
          onOpenChange={setConfirming}
          onDeleted={onDeleted}
        />
      )}
    </SettingsSection>
  );
}

export function DangerZonePage({
  onHandedOver,
  onDeleted,
}: {
  onHandedOver: () => void;
  onDeleted: () => void;
}) {
  const canHandover = useCan('organization', 'update');
  const canDelete = useCan('organization', 'delete');
  if (!canHandover && !canDelete) {
    return (
      <section className="flex flex-col gap-4">
        <SettingsHeader
          title="Danger zone"
          description="Only the owner can open this page."
        />
        <Alert>
          <TriangleAlertIcon />
          <AlertDescription>
            Handing over or deleting the school is limited to the owner.
          </AlertDescription>
        </Alert>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <SettingsHeader
        title="Danger zone"
        description="Serious actions that are hard to undo. Take your time."
      />
      {canHandover ? <HandoverSection onHandedOver={onHandedOver} /> : null}
      {canDelete ? <DeleteSection onDeleted={onDeleted} /> : null}
    </section>
  );
}
