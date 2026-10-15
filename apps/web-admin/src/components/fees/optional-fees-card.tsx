import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCan } from '@eduvault/auth-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorMessage,
  Label,
  Skeleton,
  Switch,
  toast,
} from '@eduvault/ui';
import { useApi } from '../../api';
import { feeOptionsQueryOptions, invalidateFees } from '../../queries';
import { optionToast } from './fee-text';

function useToggle(studentId: string, firstName: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      feeTypeId: string;
      name: string;
      optedIn: boolean;
    }) =>
      api.feeOptions.set({
        params: { studentId, feeTypeId: input.feeTypeId },
        body: { optedIn: input.optedIn },
      }),
    onSuccess: async (_saved, input) => {
      await invalidateFees(queryClient);
      toast.success(optionToast(firstName, input.name, input.optedIn));
    },
    onError: (failure) => {
      toast.error(failure.message);
    },
  });
}

export function OptionalFeesCard({
  studentId,
  firstName,
}: {
  studentId: string;
  firstName: string;
}) {
  const options = useQuery(feeOptionsQueryOptions(useApi(), studentId));
  const canChange = useCan('feeLine', 'update');
  const toggle = useToggle(studentId, firstName);
  if (options.data?.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Optional fees</CardTitle>
        <CardDescription>
          Billed only to students who take them, from the next round of charges.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {options.isPending ? (
          <div role="status" aria-label="Loading">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : null}
        {options.isError ? <ErrorMessage error={options.error} /> : null}
        {options.data?.map((option) => (
          <div
            key={option.feeTypeId}
            className="flex items-center justify-between gap-3"
          >
            <Label htmlFor={`fee-option-${option.feeTypeId}`}>
              {option.name}
            </Label>
            <Switch
              id={`fee-option-${option.feeTypeId}`}
              checked={option.optedIn}
              disabled={!canChange || toggle.isPending}
              onCheckedChange={(optedIn) => {
                toggle.mutate({
                  feeTypeId: option.feeTypeId,
                  name: option.name,
                  optedIn,
                });
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
