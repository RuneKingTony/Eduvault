import { useNavigate } from '@tanstack/react-router';
import { RolePage } from '../pages/role-page';

export function RolePageRoute({ slug }: { slug: string | undefined }) {
  const navigate = useNavigate();
  return (
    <RolePage
      slug={slug}
      onBack={() => {
        void navigate({ to: '/roles' });
      }}
      onCreated={(roleSlug) => {
        void navigate({ to: '/roles/$roleSlug', params: { roleSlug } });
      }}
      onDeleted={() => {
        void navigate({ to: '/roles' });
      }}
      onOpenMember={(memberId) => {
        void navigate({ to: '/members/$memberId', params: { memberId } });
      }}
      onAssign={() => {
        void navigate({ to: '/members' });
      }}
    />
  );
}
