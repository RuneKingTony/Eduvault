import type { ComponentPropsWithoutRef } from 'react';
import { Link } from '@tanstack/react-router';
import type { BillingSearch } from '../../billing-search';
import { searchFor } from '../../route-search-defaults';
import type { StudentsSearch } from '../../students-search';

export type TaskTarget =
  | { to: '/students'; search?: StudentsSearch }
  | { to: '/students/$studentId'; params: { studentId: string } }
  | { to: '/announcements' }
  | { to: '/classes' }
  | { to: '/classes/$classId'; params: { classId: string } }
  | { to: '/members/$memberId'; params: { memberId: string } }
  | { to: '/finance/billing'; search?: BillingSearch }
  | { to: '/finance/billing/$runId'; params: { runId: string } };

type AnchorProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'>;

export function TargetLink({
  dest,
  ...props
}: AnchorProps & { dest: TaskTarget }) {
  switch (dest.to) {
    case '/students': {
      return <Link to="/students" search={dest.search} {...props} />;
    }
    case '/students/$studentId': {
      return <Link to="/students/$studentId" params={dest.params} {...props} />;
    }
    case '/announcements': {
      return <Link to="/announcements" {...props} />;
    }
    case '/classes': {
      return <Link to="/classes" {...props} />;
    }
    case '/classes/$classId': {
      return <Link to="/classes/$classId" params={dest.params} {...props} />;
    }
    case '/members/$memberId': {
      return <Link to="/members/$memberId" params={dest.params} {...props} />;
    }
    case '/finance/billing': {
      return (
        <Link
          to="/finance/billing"
          search={searchFor('/finance/billing', dest.search)}
          {...props}
        />
      );
    }
    case '/finance/billing/$runId': {
      return (
        <Link
          to="/finance/billing/$runId"
          params={dest.params}
          search={{ page: undefined }}
          {...props}
        />
      );
    }
  }
}
