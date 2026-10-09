import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { notify } from '@eduvault/ui';
import {
  allowWrites,
  backToReadOnly,
  leaveActing,
  startActing,
  type SchoolRef,
} from './acting-store';

export function useActingActions() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const reset = () => queryClient.removeQueries();
  const refresh = () => {
    reset();
    void router.invalidate();
  };
  return {
    start: (school: SchoolRef) => {
      startActing(school.id, school.name);
      reset();
      notify.warning(
        `Acting in ${school.name}, read-only. Add a reason in the banner to allow writes.`
      );
      void navigate({ to: '/' });
    },
    allow: (reason: string) => {
      allowWrites(reason);
      notify.success('Writes allowed. Each one is audited with your reason.');
      refresh();
    },
    back: () => {
      backToReadOnly();
      refresh();
    },
    leave: () => {
      const left = leaveActing();
      reset();
      if (left === null) {
        void navigate({ to: '/platform/schools' });
        return;
      }
      void navigate({
        to: '/platform/schools/$schoolId',
        params: { schoolId: left.organizationId },
      });
    },
  };
}
