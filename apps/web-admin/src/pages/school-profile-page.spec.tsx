import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { renderWithApi, starterAccess } from '../test-utils';
import { profile } from '../test-school';
import { SchoolProfilePage } from './school-profile-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const LOGO_ID = '7d0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c33';

function setup(
  options: {
    school?: ReturnType<typeof profile>;
    access?: 'owner' | 'admin';
  } = {}
) {
  const api = {
    schoolAccount: {
      get: vi.fn().mockResolvedValue(options.school ?? profile()),
      update: vi.fn().mockResolvedValue(profile()),
      setLogo: vi.fn().mockResolvedValue(profile({ logoFileId: LOGO_ID })),
      removeLogo: vi.fn().mockResolvedValue(profile()),
    },
    files: {
      upload: vi.fn().mockResolvedValue({
        id: LOGO_ID,
        contentType: 'image/png',
        byteSize: 8,
        originalName: 'logo.png',
      }),
    },
  };
  const access =
    options.access === 'admin' ? starterAccess('administrator') : undefined;
  renderWithApi(<SchoolProfilePage />, api, access);
  return api;
}

const logoFile = () => new File(['x'], 'logo.png', { type: 'image/png' });

describe('SchoolProfilePage (editable)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the profile, the logo row and the currency as Naira', async () => {
    setup();

    expect(
      await screen.findByRole('heading', { name: 'School profile' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('School name')).toHaveValue(
      'Greenfield College'
    );
    expect(screen.getByLabelText('Phone')).toHaveValue('08012345678');
    expect(screen.getByText('No logo yet')).toBeInTheDocument();
    expect(screen.getByText('Naira (₦)')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Upload logo' })
    ).toBeInTheDocument();
  });

  it('saves the profile with the typed values and says so', async () => {
    const api = setup();
    await screen.findByLabelText('School name');

    fireEvent.change(screen.getByLabelText('Phone'), {
      target: { value: '0900' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(api.schoolAccount.update).toHaveBeenCalledWith({
        body: {
          name: 'Greenfield College',
          address: '1 Palm Road',
          city: 'Lagos',
          phone: '0900',
          email: 'info@greenfield.ng',
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('School profile saved.');
    });
  });

  it('asks for a name and a real email before saving', async () => {
    const api = setup();
    await screen.findByLabelText('School name');

    fireEvent.change(screen.getByLabelText('School name'), {
      target: { value: ' ' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'nope' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('Give the school a name.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Enter an email address like info@school.ng.')
    ).toBeInTheDocument();
    expect(api.schoolAccount.update).not.toHaveBeenCalled();
  });

  it('uploads a logo in two steps and says it was saved', async () => {
    const api = setup();
    const input = await screen.findByLabelText('Logo file');

    fireEvent.change(input, { target: { files: [logoFile()] } });

    await waitFor(() => {
      expect(api.schoolAccount.setLogo).toHaveBeenCalledWith({
        body: { fileId: LOGO_ID },
      });
    });
    const [{ body }] = api.files.upload.mock.calls[0] as [{ body: FormData }];
    expect(body.get('kind')).toBe('school_logo');
    expect(body.get('file')).toBeInstanceOf(File);
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Logo saved.');
    });
  });

  it('shows the server’s message when the logo is refused', async () => {
    const api = setup();
    api.files.upload.mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message: 'Choose a PNG, JPG or WebP logo.',
      })
    );
    const input = await screen.findByLabelText('Logo file');

    fireEvent.change(input, { target: { files: [logoFile()] } });

    expect(
      await screen.findByText('Choose a PNG, JPG or WebP logo.')
    ).toBeInTheDocument();
    expect(api.schoolAccount.setLogo).not.toHaveBeenCalled();
  });

  it('offers Change and Remove when there is a logo, and Remove works at once', async () => {
    const api = setup({
      school: profile({ logoFileId: LOGO_ID, logoUrl: `/files/${LOGO_ID}` }),
    });

    expect(await screen.findByText('Your logo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(api.schoolAccount.removeLogo).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Logo removed.');
    });
  });
});

describe('SchoolProfilePage (read-only)', () => {
  it('disables the fields and hides Save and the logo controls without schoolAccount:update', async () => {
    setup({ access: 'admin' });

    expect(await screen.findByLabelText('School name')).toBeDisabled();
    expect(screen.getByLabelText('Phone')).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Save changes' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Upload logo' })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Logo file')).not.toBeInTheDocument();
    expect(screen.getByText('Naira (₦)')).toBeInTheDocument();
  });
});
