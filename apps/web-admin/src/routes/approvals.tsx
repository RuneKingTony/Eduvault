import { createFileRoute } from '@tanstack/react-router';
import { ApprovalsPage } from '../pages/approvals-page';

export const Route = createFileRoute('/approvals')({
  component: ApprovalsPage,
});
