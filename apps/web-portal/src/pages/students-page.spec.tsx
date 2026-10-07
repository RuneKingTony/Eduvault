import { screen } from '@testing-library/react';
import { renderWithApi, student } from '../test-utils';
import { StudentsPage } from './students-page';

const campus = {
  id: '7d0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c33',
  organizationId: '9c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22',
  name: 'Main Campus',
  address: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('StudentsPage', () => {
  it('lists students with their campus name', async () => {
    renderWithApi(<StudentsPage />, {
      students: { list: vi.fn().mockResolvedValue([student()]) },
      campuses: { list: vi.fn().mockResolvedValue([campus]) },
    });

    expect(await screen.findByText('Ada Obi')).toBeInTheDocument();
    expect(await screen.findByText(/GF-001 · Main Campus/)).toBeInTheDocument();
  });

  it('shows the API error message', async () => {
    renderWithApi(<StudentsPage />, {
      students: {
        list: vi.fn().mockRejectedValue(new Error('No active school')),
      },
      campuses: { list: vi.fn().mockResolvedValue([]) },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No active school'
    );
  });
});
