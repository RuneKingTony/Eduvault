import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  UserPlusIcon,
} from 'lucide-react';
import {
  ADMIT_NO_TERM_MESSAGE,
  ApiError,
  type AdmissionPreview,
  type AdmitStudentResult,
} from '@eduvault/api-contract';
import { Can, useCan } from '@eduvault/auth-client';
import { lagosDateOf } from '@eduvault/shared';
import {
  Alert,
  AlertDescription,
  Button,
  ErrorMessage,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  cn,
  toast,
} from '@eduvault/ui';
import {
  ADMIT_STEPS,
  admitBody,
  initialAdmitForm,
  studentErrors,
  type AdmitForm,
  type Admitter,
  type AdmitStep,
  type StudentErrors,
} from '../admit-model';
import { useApi } from '../api';
import {
  draftErrors,
  draftsProblem,
  hasErrors,
  withPayer,
  type DraftErrors,
} from '../guardian-draft';
import { admissionPreviewQueryOptions, invalidateStudents } from '../queries';
import {
  ClassStep,
  GuardianStep,
  ReviewStep,
  StudentStep,
} from './admit-steps';

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdmitted: (result: AdmitStudentResult) => void;
  onOpenCalendar: () => void;
}

function Stepper({ step }: { step: AdmitStep }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Steps">
      {ADMIT_STEPS.map((name, index) => (
        <li
          key={name}
          aria-current={index === step ? 'step' : undefined}
          className={cn(
            'flex items-center gap-1',
            index === step ? 'font-medium' : 'text-muted-foreground'
          )}
        >
          {index < step ? <CheckIcon className="size-3" /> : null}
          {name}
        </li>
      ))}
    </ol>
  );
}

function NoTermState({ onOpenCalendar }: { onOpenCalendar: () => void }) {
  const canSee = useCan('session', 'read');
  return (
    <Alert>
      <AlertDescription>
        <p>{ADMIT_NO_TERM_MESSAGE}</p>
        {canSee ? (
          <Button type="button" variant="link" onClick={onOpenCalendar}>
            School years and terms
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function useAdmit(onAdmitted: (result: AdmitStudentResult) => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (form: AdmitForm) =>
      api.students.create({ body: admitBody(form) }),
    onSuccess: async (result) => {
      await invalidateStudents(queryClient);
      onAdmitted(result);
    },
  });
}

function useDuplicates(form: AdmitForm) {
  const api = useApi();
  const { firstName, lastName, dateOfBirth } = form;
  return useQuery({
    queryKey: ['students', 'duplicates', firstName, lastName, dateOfBirth],
    queryFn: () =>
      api.admissions.duplicates({
        query: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          dateOfBirth,
        },
      }),
    enabled: form.step === 3,
  });
}

const enterClassStep = (
  form: AdmitForm,
  preview: AdmissionPreview
): Partial<AdmitForm> => ({
  step: 1,
  classArmId: form.classArmId || (preview.classes[0]?.id ?? ''),
});

const guardianErrorsOf = (form: AdmitForm): Record<number, DraftErrors> =>
  Object.fromEntries(
    form.guardians.map((draft) => [draft.key, draftErrors(draft)])
  );

function useAdmitter(): Admitter {
  return {
    canLink: useCan('guardian', 'link'),
    canCreate: useCan('guardian', 'create'),
  };
}

function useAdmitFlow(
  preview: AdmissionPreview,
  onAdmitted: (result: AdmitStudentResult) => void
) {
  const admitter = useAdmitter();
  const [form, setForm] = useState(() => initialAdmitForm(admitter));
  const [errors, setErrors] = useState<StudentErrors>({});
  const [guardianErrors, setGuardianErrors] = useState<
    Record<number, DraftErrors>
  >({});
  const today = lagosDateOf(new Date());
  const admit = useAdmit(onAdmitted);
  const matches = useDuplicates(form).data?.matches ?? [];
  const change = (patch: Partial<AdmitForm>) => {
    setForm({ ...form, ...patch });
  };

  function leaveStudentStep() {
    const found = studentErrors(form, today);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      change(enterClassStep(form, preview));
    }
  }

  function leaveGuardianStep() {
    const problem = draftsProblem(form.guardians);
    if (problem !== undefined) {
      toast.error(problem);
      return;
    }
    const found = guardianErrorsOf(form);
    setGuardianErrors(found);
    if (!Object.values(found).some((entry) => hasErrors(entry))) {
      change({ step: 3, guardians: withPayer(form.guardians) });
    }
  }

  const leave = [
    leaveStudentStep,
    () => {
      change({ step: 2 });
    },
    leaveGuardianStep,
  ];
  return {
    form,
    errors,
    guardianErrors,
    today,
    admit,
    matches,
    admitter,
    change,
    advance: () => {
      leave[form.step]?.();
    },
    back: () => {
      change({ step: Math.max(0, form.step - 1) as AdmitStep });
    },
  };
}

type Flow = ReturnType<typeof useAdmitFlow>;

function StepBody({
  flow,
  preview,
}: {
  flow: Flow;
  preview: AdmissionPreview;
}) {
  const { form, change } = flow;
  switch (form.step) {
    case 0: {
      return (
        <StudentStep
          form={form}
          errors={flow.errors}
          today={flow.today}
          onChange={change}
        />
      );
    }
    case 1: {
      return <ClassStep preview={preview} form={form} onChange={change} />;
    }
    case 2: {
      return (
        <GuardianStep
          form={form}
          preview={preview}
          admitter={flow.admitter}
          errors={flow.guardianErrors}
          onChange={change}
        />
      );
    }
    case 3: {
      return (
        <ReviewStep form={form} preview={preview} matches={flow.matches} />
      );
    }
  }
}

function AdmitFooter({
  flow,
  noClasses,
  onCancel,
}: {
  flow: Flow;
  noClasses: boolean;
  onCancel: () => void;
}) {
  const { form, admit } = flow;
  return (
    <SheetFooter>
      {form.step === 0 ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      ) : (
        <Button type="button" variant="ghost" onClick={flow.back}>
          <ChevronLeftIcon />
          Back
        </Button>
      )}
      {form.step === 3 ? (
        <Button
          type="button"
          disabled={admit.isPending}
          onClick={() => {
            admit.mutate(form);
          }}
        >
          <UserPlusIcon />
          {flow.matches.length > 0 ? 'Admit anyway' : 'Admit and enrol'}
        </Button>
      ) : (
        <Button
          type="button"
          disabled={form.step === 1 && noClasses}
          onClick={flow.advance}
        >
          Next
          <ChevronRightIcon />
        </Button>
      )}
    </SheetFooter>
  );
}

function AdmitFlow({
  preview,
  onOpenChange,
  onAdmitted,
}: {
  preview: AdmissionPreview;
  onOpenChange: (open: boolean) => void;
  onAdmitted: (result: AdmitStudentResult) => void;
}) {
  const flow = useAdmitFlow(preview, onAdmitted);
  return (
    <>
      <SheetHeader>
        <SheetTitle>Admit a student</SheetTitle>
        <SheetDescription asChild>
          <div>
            <Stepper step={flow.form.step} />
          </div>
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4">
        <StepBody flow={flow} preview={preview} />
        <ErrorMessage error={flow.admit.error} />
      </div>
      <AdmitFooter
        flow={flow}
        noClasses={preview.classes.length === 0}
        onCancel={() => {
          onOpenChange(false);
        }}
      />
    </>
  );
}

function AdmitBody(props: Omit<SheetProps, 'open'>) {
  const api = useApi();
  const preview = useQuery({
    ...admissionPreviewQueryOptions(api),
    retry: false,
  });
  if (preview.isPending) {
    return <Skeleton className="m-4 h-40" />;
  }
  if (preview.data === undefined) {
    const noTerm =
      preview.error instanceof ApiError && preview.error.status === 409;
    return (
      <div className="flex flex-col gap-3 p-4">
        <SheetHeader className="p-0">
          <SheetTitle>Admit a student</SheetTitle>
          <SheetDescription>Add a student to the school.</SheetDescription>
        </SheetHeader>
        {noTerm ? (
          <NoTermState onOpenCalendar={props.onOpenCalendar} />
        ) : (
          <ErrorMessage error={preview.error} />
        )}
      </div>
    );
  }
  return (
    <AdmitFlow
      preview={preview.data}
      onOpenChange={props.onOpenChange}
      onAdmitted={props.onAdmitted}
    />
  );
}

/** Mounted only while open, so every opening starts a fresh draft. */
export function AdmitStudentSheet(props: SheetProps) {
  return (
    <Can permission="student:create">
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          {props.open ? <AdmitBody {...props} /> : null}
        </SheetContent>
      </Sheet>
    </Can>
  );
}
