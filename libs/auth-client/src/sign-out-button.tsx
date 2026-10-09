import { Button } from '@eduvault/ui';
import type { EduvaultAuthClient } from './auth-client';

export function SignOutButton({
  authClient,
  onSignedOut,
}: {
  authClient: EduvaultAuthClient;
  onSignedOut?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        void authClient.signOut().then((result) => {
          if (result.error === null) {
            onSignedOut?.();
          }
        });
      }}
    >
      Sign out
    </Button>
  );
}
