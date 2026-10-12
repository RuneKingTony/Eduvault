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

  describe('classes', () => {
    it('says every class when a role reaches them all', () => {
      renderCard({
        permissions: toPermissionMap(['class:read', 'class:readAll']),
        classScope: 'all',
      });
      expect(screen.getByText('Classes')).toBeInTheDocument();
      expect(screen.getByText('Every class')).toBeInTheDocument();
    });

    it('names the classes they teach', () => {
      renderCard({
        permissions: toPermissionMap(['class:read']),
        classScope: ['arm-1', 'arm-2'],
        classes: [
          { id: 'arm-1', displayName: 'JSS 1 Gold' },
          { id: 'arm-2', displayName: 'JSS 2 Blue' },
        ],
      });
      expect(
        screen.getByText('JSS 1 Gold, JSS 2 Blue (classes they teach)')
      ).toBeInTheDocument();
    });

    it('says so when they teach none yet', () => {
      renderCard({
        permissions: toPermissionMap(['class:read']),
        classScope: [],
      });
      expect(screen.getByText('No classes assigned yet')).toBeInTheDocument();
    });

    it('hides the line for someone with no class access', () => {
      renderCard({ permissions: toPermissionMap(['student:read']) });
      expect(screen.queryByText('Classes')).not.toBeInTheDocument();
    });
  });
});
