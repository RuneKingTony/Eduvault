import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@eduvault/ui';
import { useApi } from '../../api';
import { refreshForCurrentTerm } from '../../queries';
import { termTitle, type TermInYear } from './calendar-text';

export function useMakeCurrent(onDone?: () => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ term }: TermInYear) =>
      api.terms.makeCurrent({ params: { id: term.id } }),
    onSuccess: async (_made, { term, year }) => {
      await refreshForCurrentTerm(queryClient);
      toast.success(`${termTitle(term, year)} is now the current term.`);
      onDone?.();
    },
  });
}
