import { useAuthClient, usePermissions } from '@eduvault/auth-client';
import { MEMBER_ROLE } from '@eduvault/policy';
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@eduvault/ui';
import { useMyAccess } from '../components/my-access';
import { useSchool } from '../use-school';

function NoAccessDashboard({ hasRole }: { hasRole: boolean }) {
  const { schoolName, user } = useSchool(useAuthClient());
  const { openMyAccess } = useMyAccess();
  const [firstName = user.name] = user.name.split(' ');
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1>Welcome, {firstName}</h1>
        <p className="text-muted-foreground">{schoolName}</p>
      </div>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No access yet</EmptyTitle>
          <EmptyDescription>
            {hasRole
              ? 'Your role doesn’t give you anything to see yet. This page fills in once the owner changes it.'
              : 'You’re on the staff list, but you can’t see anything until the owner gives you a role. This page fills in once they do.'}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" onClick={openMyAccess}>
            See my access
          </Button>
        </EmptyContent>
      </Empty>
    </section>
  );
}

export function DashboardPage() {
  const { permissions, roles } = usePermissions();
  if (Object.keys(permissions).length === 0) {
    return (
      <NoAccessDashboard hasRole={roles.some((role) => role !== MEMBER_ROLE)} />
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <h1>Dashboard</h1>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing here yet</EmptyTitle>
          <EmptyDescription>
            Your school at a glance will show up here as the other pages come
            online.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </section>
  );
}
