import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  electiveTakersSavedMessage,
  type ElectiveList,
} from '@eduvault/api-contract';
import {
  Checkbox,
  SearchInput,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
} from '@eduvault/ui';
import { toggled } from '@eduvault/shared';
import { useApi } from '../../api';
import { invalidateLevelLists } from '../../queries';
import { groupStudents } from './elective-takers-model';
import { SaveFooter } from './save-footer';

export interface ElectiveTarget {
  subjectId: string;
  name: string;
  takerIds: readonly string[];
  electiveLevelIds: ReadonlySet<string>;
}

type Session = NonNullable<ElectiveList['session']>;

function useSaveTakers(
  target: ElectiveTarget,
  session: Session,
  onSaved: () => void
) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentIds: string[]) =>
      api.electives.set({
        params: { subjectId: target.subjectId },
        body: { sessionId: session.id, studentIds },
      }),
    onSuccess: async (saved) => {
      await invalidateLevelLists(queryClient);
      toast.success(
        electiveTakersSavedMessage(saved.studentIds.length, target.name)
      );
      onSaved();
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

function StudentGroups({
  groups,
  selected,
  onToggle,
}: {
  groups: ReturnType<typeof groupStudents>;
  selected: readonly string[];
  onToggle: (studentId: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No students to show.</p>
    );
  }
  return (
    <>
      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium">{group.label}</h3>
          <ul className="flex flex-col gap-1">
            {group.students.map((student) => (
              <li key={student.id} className="flex items-center gap-2">
                <Checkbox
                  id={`taker-${student.id}`}
                  checked={selected.includes(student.id)}
                  onCheckedChange={() => {
                    onToggle(student.id);
                  }}
                />
                <Label htmlFor={`taker-${student.id}`} className="font-normal">
                  {student.name}
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {student.admissionNumber}
                  </span>
                </Label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function TakerBody({
  target,
  list,
  session,
  onClose,
}: {
  target: ElectiveTarget;
  list: ElectiveList;
  session: Session;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([...target.takerIds]);
  const [search, setSearch] = useState('');
  const save = useSaveTakers(target, session, onClose);
  const groups = groupStudents(list.students, target.electiveLevelIds, search);
  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {target.name} · {session.name}
        </SheetTitle>
        <SheetDescription>
          Students at levels where {target.name} is an elective.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 overflow-y-auto px-4">
        <SearchInput
          aria-label="Search students"
          placeholder="Search name or GF number"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
        <StudentGroups
          groups={groups}
          selected={selected}
          onToggle={(id) => {
            setSelected(toggled(selected, id, !selected.includes(id)));
          }}
        />
      </div>
      <SaveFooter
        label="Save"
        pending={save.isPending}
        onCancel={onClose}
        onSave={() => {
          save.mutate(selected);
        }}
      />
    </>
  );
}

export function ElectiveTakersSheet({
  target,
  list,
  onClose,
}: {
  target: ElectiveTarget | null;
  list: ElectiveList;
  onClose: () => void;
}) {
  const { session } = list;
  return (
    <Sheet
      open={target !== null && session !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent className="overflow-y-auto">
        {target === null || session === null ? null : (
          <TakerBody
            key={target.subjectId}
            target={target}
            list={list}
            session={session}
            onClose={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
