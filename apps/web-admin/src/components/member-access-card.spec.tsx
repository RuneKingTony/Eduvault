import { render, screen } from '@testing-library/react';
import { toPermissionMap } from '@eduvault/policy';
import { IKEJA, LEKKI, detail } from '../test-members';
import { MemberAccessCard } from './member-access-card';

const renderCard = (overrides: Parameters<typeof detail>[0] = {}) =>
  render(
    <MemberAccessCard member={detail(overrides)} campuses={[LEKKI, IKEJA]} />
  );

describe('MemberAccessCard', () => {
  it('invites a role when the member can do nothing yet', () => {
    renderCard();
    expect(
      screen.getByText('Nothing yet. Give them a role to get started.')
    ).toBeInTheDocument();
    expect(screen.getByText('Lekki')).toBeInTheDocument();
  });

  it('lists what their roles allow in plain words', () => {
    renderCard({
      permissions: toPermissionMap(['student:read', 'member:read']),
    });
    expect(screen.getByText('Students: can see')).toBeInTheDocument();
    expect(screen.getByText('Staff: can see')).toBeInTheDocument();
    expect(
      screen.queryByText('Nothing yet. Give them a role to get started.')
    ).not.toBeInTheDocument();
  });

  it('says every campus when a role reaches them all', () => {
    renderCard({
      permissions: toPermissionMap(['campus:readAll']),
      campusScope: 'all',
    });
    expect(screen.getByText('Every campus')).toBeInTheDocument();
  });

  it('names the campuses they belong to otherwise', () => {
    renderCard({ campusIds: [LEKKI.id, IKEJA.id] });
    expect(screen.getByText('Lekki, Ikeja')).toBeInTheDocument();
  });

  it('says so when they belong to no campus', () => {
    renderCard({ campusIds: [] });
    expect(screen.getByText('No campuses')).toBeInTheDocument();
  });
});
