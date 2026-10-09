import { Link } from '@tanstack/react-router';
import { Button, NotFoundState, PageSkeleton } from '@eduvault/ui';

export function NotFoundPage() {
  return (
    <NotFoundState>
      <Button asChild variant="outline" size="sm">
        <Link to="/">Go to Home</Link>
      </Button>
    </NotFoundState>
  );
}

export function PendingPage() {
  return <PageSkeleton />;
}
