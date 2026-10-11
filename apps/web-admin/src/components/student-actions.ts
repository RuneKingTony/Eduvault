import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  LeaveInput,
  MarkAwayInput,
  StudentDetail,
  StudentTab,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateStudents } from '../queries';
import { backInSchoolToast, markAwayToast } from './student-lifecycle-model';

type Student = Pick<StudentDetail, 'id' | 'firstName' | 'life'>;

function useStudentMutation<Body>(
  call: (body: Body) => Promise<unknown>,
  onSuccess: (body: Body) => void
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: async (_result, body) => {
      await invalidateStudents(queryClient);
      onSuccess(body);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useMarkAway(
  student: Student,
  input: { today: string; onDone: () => void }
) {
  const api = useApi();
  return useStudentMutation(
    (body: MarkAwayInput) =>
      api.students.markAway({ params: { id: student.id }, body }),
    (body) => {
      const message = markAwayToast(student, {
        date: body.date,
        today: input.today,
      });
      toast[message.kind](message.text);
      input.onDone();
    }
  );
}

export function useBackInSchool(student: Student) {
  const api = useApi();
  return useStudentMutation(
    () => api.students.backInSchool({ params: { id: student.id } }),
    () => {
      toast.success(backInSchoolToast(student));
    }
  );
}

export function useLeave(
  student: Student,
  input: { onOpenTab: (tab: StudentTab) => void; onDone: () => void }
) {
  const api = useApi();
  return useStudentMutation(
    (body: LeaveInput) =>
      api.students.leave({ params: { id: student.id }, body }),
    () => {
      toast.success('Recorded as left. Nothing was deleted.', {
        action: {
          label: 'Left tab',
          onClick: () => {
            input.onOpenTab('left');
          },
        },
      });
      input.onDone();
    }
  );
}

export function useUndoLeaving(student: Student, onDone: () => void) {
  const api = useApi();
  return useStudentMutation(
    () => api.students.undoLeaving({ params: { id: student.id } }),
    () => {
      toast.success(`${student.firstName} is back on the roll.`);
      onDone();
    }
  );
}

export function useMoveForNextTerm(
  student: Student,
  input: { currentTerm: string; nextTerm: string; onDone: () => void }
) {
  const api = useApi();
  return useStudentMutation(
    (body: { termId: string; classArmId: string }) =>
      api.students.place({ params: { id: student.id }, body }),
    () => {
      toast.success(
        `${input.nextTerm} placement added. ${input.currentTerm} is unchanged.`
      );
      input.onDone();
    }
  );
}
