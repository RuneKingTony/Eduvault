import { createFileRoute } from '@tanstack/react-router';
import { redirectTo } from '../redirect-to';

export const Route = createFileRoute('/platform/')({
  beforeLoad: () => {
    redirectTo('/platform/schools');
  },
});
