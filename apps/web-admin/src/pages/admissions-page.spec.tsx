import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { renderWithApi, starterAccess } from '../test-utils';
import { settings } from '../test-school';
import { AdmissionsPage } from './admissions-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup(access?: ReturnType<typeof starterAccess>) {
  const api = {
    schoolSettings: {
      get: vi.fn().mockResolvedValue(settings()),
      update: vi.fn().mockResolvedValue(settings({ maxGuardians: 3 })),
    },
  };
  renderWithApi(<AdmissionsPage />, api, access);
  return api;
}

describe('AdmissionsPage (editable)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the guardian rules and the always-on portal logins', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: 'Admissions rules' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Most guardians per student')).toHaveValue(4);
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.getByText('Always on')).toBeInTheDocument();
  });

  it('saves the limit when it changes and says what it is now', async () => {
    const api = setup();
    const input = await screen.findByLabelText('Most guardians per student');

    fireEvent.change(input, { target: { value: '3' } });

    await waitFor(() => {
      expect(api.schoolSettings.update).toHaveBeenCalledWith({
        body: { maxGuardians: 3 },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'A student can now have up to 3 guardians.'
      );
    });
  });

  it('waits for typing to pause and saves only the final number', async () => {
    const api = setup();
    api.schoolSettings.update.mockResolvedValue(settings({ maxGuardians: 5 }));
    const input = await screen.findByLabelText('Most guardians per student');

    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '5' } });

    await waitFor(
      () => {
        expect(api.schoolSettings.update).toHaveBeenCalledWith({
          body: { maxGuardians: 5 },
        });
      },
      { timeout: 3000 }
    );
    expect(api.schoolSettings.update).toHaveBeenCalledTimes(1);
  });

  it('says "1 guardian" in the singular', async () => {
    const api = setup();
    api.schoolSettings.update.mockResolvedValue(settings({ maxGuardians: 1 }));
    const input = await screen.findByLabelText('Most guardians per student');

    fireEvent.change(input, { target: { value: '1' } });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'A student can now have up to 1 guardian.'
      );
    });
  });

  it('shows the 400 message and puts the number back when the limit is out of range', async () => {
    const api = setup();
    api.schoolSettings.update.mockRejectedValue(
      new ApiError(400, {
        code: 'ValidationError',
        message: 'Request validation failed',
        issues: [
          { path: 'maxGuardians', message: 'Choose a number from 1 to 6.' },
        ],
      })
    );
    const input = await screen.findByLabelText('Most guardians per student');

    fireEvent.change(input, { target: { value: '7' } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Choose a number from 1 to 6.');
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Most guardians per student')).toHaveValue(
        4
      );
    });
  });

  it('saves the switch with the matching toast each way', async () => {
    const api = setup();
    const toggle = await screen.findByRole('switch');
    api.schoolSettings.update.mockResolvedValueOnce(
      settings({ requireGuardian: false })
    );

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(api.schoolSettings.update).toHaveBeenCalledWith({
        body: { requireGuardian: false },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'A guardian can now be added after admission.'
      );
    });
  });
});

describe('AdmissionsPage (read-only)', () => {
  it('disables the controls without schoolAccount:update', async () => {
    setup(starterAccess('administrator'));

    expect(
      await screen.findByLabelText('Most guardians per student')
    ).toBeDisabled();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /save/i })
    ).not.toBeInTheDocument();
  });
});
