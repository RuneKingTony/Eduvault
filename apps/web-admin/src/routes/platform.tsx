import { createFileRoute } from '@tanstack/react-router';
import { PlatformShell } from '../components/platform-shell';
import { redirectTo } from '../redirect-to';

export const Route = createFileRoute('/platform')({
  beforeLoad: ({ context }) => {
    if (context.me.platformRole === null) {
      redirectTo('/');
    }
  },
  component: PlatformShell,
});
