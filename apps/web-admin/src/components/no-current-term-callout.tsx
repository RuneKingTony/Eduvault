import { useNavigate } from '@tanstack/react-router';
import { CalendarPlusIcon } from 'lucide-react';
import { useCan } from '@eduvault/auth-client';
import { Alert, AlertDescription, AlertTitle, Button } from '@eduvault/ui';

export function NoCurrentTermCallout() {
  const navigate = useNavigate();
  const canCreate = useCan('session', 'create');
  if (!canCreate) {
    return (
      <Alert>
        <CalendarPlusIcon />
        <AlertDescription>
          Your school hasn’t set up its school year yet.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert>
      <CalendarPlusIcon />
      <AlertTitle>Create the first school year</AlertTitle>
      <AlertDescription>
        <p>Terms, holidays and charges all hang off a school year.</p>
        <Button
          type="button"
          size="sm"
          className="mt-2"
          onClick={() => {
            void navigate({ to: '/calendar', search: { dialog: 'new-year' } });
          }}
        >
          New school year
        </Button>
      </AlertDescription>
    </Alert>
  );
}
