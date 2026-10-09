import { useState, type SubmitEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCogIcon } from 'lucide-react';
import type {
  PlatformSchool,
  PlatformSchoolMember,
  ReplaceOwnerInput,
} from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  FieldError,
  Label,
  NativeSelect,
  NativeSelectOption,
  RadioGroup,
  RadioGroupItem,
  TextField,
  fieldValue,
  notify,
} from '@eduvault/ui';
import { useApi } from '../api';
import { invalidatePlatform, platformMembersQueryOptions } from '../queries';

export interface NewOwnerPassword {
  schoolName: string;
  email: string;
  password: string;
}

type Mode = 'member' | 'new';
type Previous = ReplaceOwnerInput['previousOwner'];

const holdsOwner = (member: PlatformSchoolMember) =>
  member.roles.includes('owner');

function RadioRow({
  group,
  value,
  label,
}: {
  group: string;
  value: string;
  label: string;
}) {
  const id = `${group}-${value}`;
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

function MemberPicker({
  members,
  value,
  onChange,
}: {
  members: PlatformSchoolMember[];
  value: string;
  onChange: (memberId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="replace-owner-member">Member</Label>
      <NativeSelect
        id="replace-owner-member"
        className="w-full"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <NativeSelectOption value="">Choose a member</NativeSelectOption>
        {members.map((member) => (
          <NativeSelectOption key={member.memberId} value={member.memberId}>
            {member.name} ({member.email})
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function useReplaceOwner(
  school: PlatformSchool,
  onDone: (result: NewOwnerPassword | null) => void
) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { body: ReplaceOwnerInput; ownerName: string }) =>
      api.platform.schools.replaceOwner({
        params: { id: school.id },
        body: variables.body,
      }),
    onSuccess: async (result, variables) => {
      await invalidatePlatform(queryClient);
      notify.success(
        `${variables.ownerName} is now the owner of ${school.name}.`
      );
      const email =
        'email' in variables.body.newOwner ? variables.body.newOwner.email : '';
      onDone(
        result.temporaryPassword === null
          ? null
          : {
              schoolName: school.name,
              email,
              password: result.temporaryPassword,
            }
      );
    },
  });
}

function oldOwnerLabel(school: PlatformSchool): string {
  const [only, ...others] = school.owners;
  return only !== undefined && others.length === 0
    ? only.name
    : 'the current owners';
}

interface OwnerChoice {
  mode: Mode;
  memberId: string;
  previous: Previous;
}

function useOwnerChoice() {
  const [choice, setChoice] = useState<OwnerChoice>({
    mode: 'member',
    memberId: '',
    previous: 'member',
  });
  return {
    choice,
    setMode: (mode: Mode) => {
      setChoice((current) => ({ ...current, mode }));
    },
    setMemberId: (memberId: string) => {
      setChoice((current) => ({ ...current, memberId }));
    },
    setPrevious: (previous: Previous) => {
      setChoice((current) => ({ ...current, previous }));
    },
  };
}

function requestFor(
  choice: OwnerChoice,
  typed: { name: string; email: string },
  candidates: PlatformSchoolMember[]
): { body: ReplaceOwnerInput; ownerName: string } | string {
  if (choice.mode === 'member') {
    const member = candidates.find(
      (candidate) => candidate.memberId === choice.memberId
    );
    return member === undefined
      ? 'Choose who becomes the owner.'
      : {
          body: {
            newOwner: { memberId: member.memberId },
            previousOwner: choice.previous,
          },
          ownerName: member.name,
        };
  }
  return typed.name === '' || typed.email === ''
    ? 'Enter the new owner’s name and email.'
    : {
        body: { newOwner: typed, previousOwner: choice.previous },
        ownerName: typed.name,
      };
}

function PreviousOwnerChoice({
  school,
  value,
  onChange,
}: {
  school: PlatformSchool;
  value: Previous;
  onChange: (value: Previous) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">
        What happens to {oldOwnerLabel(school)}
      </legend>
      <RadioGroup
        value={value}
        onValueChange={(next) => {
          onChange(next as Previous);
        }}
      >
        <RadioRow
          group="previous-owner"
          value="member"
          label="Stays as a member with no roles"
        />
        <RadioRow
          group="previous-owner"
          value="remove"
          label="Is removed from the school"
        />
      </RadioGroup>
    </fieldset>
  );
}

function NewOwnerChoice({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">New owner</legend>
      <RadioGroup
        value={mode}
        onValueChange={(next) => {
          onChange(next as Mode);
        }}
      >
        <RadioRow
          group="new-owner"
          value="member"
          label="Someone already in this school"
        />
        <RadioRow group="new-owner" value="new" label="A new person" />
      </RadioGroup>
    </fieldset>
  );
}

function OwnerFields({
  choice,
  candidates,
  onMember,
}: {
  choice: OwnerChoice;
  candidates: PlatformSchoolMember[];
  onMember: (memberId: string) => void;
}) {
  return choice.mode === 'member' ? (
    <MemberPicker
      members={candidates}
      value={choice.memberId}
      onChange={onMember}
    />
  ) : (
    <>
      <TextField label="Name" name="name" />
      <TextField label="Email" name="email" type="email" />
    </>
  );
}

function FormActions({
  pending,
  onClose,
}: {
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        <UserCogIcon />
        Replace owner
      </Button>
    </DialogFooter>
  );
}

function ReplaceOwnerForm({
  school,
  onClose,
  onPassword,
}: {
  school: PlatformSchool;
  onClose: () => void;
  onPassword: (password: NewOwnerPassword) => void;
}) {
  const api = useApi();
  const members = useQuery(platformMembersQueryOptions(api, school.id));
  const candidates = (members.data?.items ?? []).filter(
    (member) => !holdsOwner(member)
  );
  const { choice, setMode, setMemberId, setPrevious } = useOwnerChoice();
  const [problem, setProblem] = useState<string | null>(null);
  const replace = useReplaceOwner(school, (password) => {
    onClose();
    if (password !== null) {
      onPassword(password);
    }
  });

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const typed = {
      name: fieldValue(data, 'name').trim(),
      email: fieldValue(data, 'email').trim(),
    };
    const request = requestFor(choice, typed, candidates);
    if (typeof request === 'string') {
      setProblem(request);
      return;
    }
    setProblem(null);
    replace.mutate(request);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <NewOwnerChoice mode={choice.mode} onChange={setMode} />
      <OwnerFields
        choice={choice}
        candidates={candidates}
        onMember={setMemberId}
      />
      <PreviousOwnerChoice
        school={school}
        value={choice.previous}
        onChange={setPrevious}
      />
      <FieldError message={problem} />
      <ErrorMessage error={replace.error ?? members.error} />
      <FormActions pending={replace.isPending} onClose={onClose} />
    </form>
  );
}

export function ReplaceOwnerDialog({
  school,
  open,
  onOpenChange,
  onPassword,
}: {
  school: PlatformSchool;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPassword: (password: NewOwnerPassword) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace the owner of {school.name}</DialogTitle>
          <DialogDescription>
            The new owner is added first, then the old owner loses the owner
            role. The school is never without an owner.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <ReplaceOwnerForm
            school={school}
            onClose={() => {
              onOpenChange(false);
            }}
            onPassword={onPassword}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
