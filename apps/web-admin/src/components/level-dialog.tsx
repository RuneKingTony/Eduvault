import { useState, type SubmitEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import {
  CLASS_LEVEL_NAME_MAX,
  createClassLevelSchema,
  type ClassLevel,
} from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldError,
  NativeSelectOption,
  SelectField,
  TextField,
  fieldValue,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateLevels } from '../queries';

const FINAL_YEAR = '';

interface LevelInput {
  code: string;
  name: string;
  nextLevelId: string | null;
}

function useSaveLevel(level: ClassLevel | undefined, saved: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ code, name, nextLevelId }: LevelInput) =>
      level === undefined
        ? api.classLevels.create({ body: { code, name, nextLevelId } })
        : api.classLevels.update({
            params: { id: level.id },
            body: { name, nextLevelId },
          }),
    onSuccess: async (result) => {
      await invalidateLevels(queryClient);
      toast.success(
        level === undefined ? `${result.name} added.` : `${result.name} saved.`
      );
      saved();
    },
  });
}

function NextLevelField({
  levels,
  level,
}: {
  levels: readonly ClassLevel[];
  level: ClassLevel | undefined;
}) {
  return (
    <SelectField
      label="Next level"
      name="nextLevelId"
      defaultValue={level?.nextLevelId ?? FINAL_YEAR}
      hint="Where students of this level go next. The last level is the final year."
    >
      <NativeSelectOption value={FINAL_YEAR}>Final year</NativeSelectOption>
      {levels
        .filter((candidate) => candidate.id !== level?.id)
        .map((candidate) => (
          <NativeSelectOption key={candidate.id} value={candidate.id}>
            {candidate.name}
          </NativeSelectOption>
        ))}
    </SelectField>
  );
}

function useLevelForm(level: ClassLevel | undefined, onClose: () => void) {
  const [error, setError] = useState<string | undefined>();
  const save = useSaveLevel(level, onClose);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextLevelId = fieldValue(data, 'nextLevelId');
    const code = level?.code ?? fieldValue(data, 'code').trim().toUpperCase();
    const parsed = createClassLevelSchema.safeParse({
      code,
      name: fieldValue(data, 'name'),
      nextLevelId: nextLevelId === FINAL_YEAR ? null : nextLevelId,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    save.mutate(
      {
        code,
        name: parsed.data.name,
        nextLevelId: parsed.data.nextLevelId ?? null,
      },
      {
        onError: (failure) => {
          setError(failure.message);
        },
      }
    );
  }

  return { error, submit, pending: save.isPending };
}

function LevelFields({
  level,
  levels,
}: {
  level: ClassLevel | undefined;
  levels: readonly ClassLevel[];
}) {
  return (
    <>
      {level === undefined ? (
        <TextField
          label="Code"
          name="code"
          autoComplete="off"
          maxLength={8}
          placeholder="CRE"
          required
        />
      ) : null}
      <TextField
        label="Name"
        name="name"
        autoComplete="off"
        maxLength={CLASS_LEVEL_NAME_MAX}
        defaultValue={level?.name ?? ''}
        required
      />
      <NextLevelField levels={levels} level={level} />
    </>
  );
}

function LevelForm({
  level,
  levels,
  onClose,
}: {
  level: ClassLevel | undefined;
  levels: readonly ClassLevel[];
  onClose: () => void;
}) {
  const form = useLevelForm(level, onClose);
  return (
    <form className="flex flex-col gap-4" onSubmit={form.submit} noValidate>
      <DialogHeader>
        <DialogTitle>
          {level === undefined ? 'Add level' : `Edit ${level.name}`}
        </DialogTitle>
        <DialogDescription>
          {level === undefined
            ? 'A level is a year group every campus uses. It goes after the current last level; move it afterwards.'
            : 'Change the name or where students go next. The code is fixed.'}
        </DialogDescription>
      </DialogHeader>
      <LevelFields level={level} levels={levels} />
      <FieldError message={form.error} />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.pending}>
          {level === undefined ? <PlusIcon /> : null}
          {level === undefined ? 'Add level' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function LevelDialog({
  level,
  levels,
  open,
  onOpenChange,
}: {
  level?: ClassLevel;
  levels: readonly ClassLevel[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <LevelForm
          level={level}
          levels={levels}
          onClose={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
