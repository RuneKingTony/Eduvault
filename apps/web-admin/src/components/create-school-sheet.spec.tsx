import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  ApiError,
  type CreateSchoolResult,
  type PlatformSchool,
} from '@eduvault/api-contract';
import { PlatformSchoolsPage } from '../pages/platform-schools-page';
import { platformSchool, renderWithApi, schoolList } from '../test-utils';

const created = (
  overrides: Partial<CreateSchoolResult> = {}
): CreateSchoolResult => {
  const school: PlatformSchool = platformSchool({
    slug: 'greenfield-college',
    admissionPrefix: 'GC',
    owners: [{ id: 'o1', name: 'Funmi', email: 'funmi@greenfield.test' }],
  });
  return {
    school,
    owner: { id: 'o1', email: 'funmi@greenfield.test' },
    temporaryPassword: 'Tmp9Pass2Word',
    ...overrides,
  };
};

function setup(create: ReturnType<typeof vi.fn>) {
  const list = vi.fn().mockResolvedValue(schoolList([]));
  renderWithApi(
    <PlatformSchoolsPage onOpenSchool={vi.fn()} onOpenAudit={vi.fn()} />,
    {
      platform: { schools: { list, create } },
    }
  );
  return { list, create };
}

const type = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

async function openSheet() {
  fireEvent.click(await screen.findByRole('button', { name: 'Create school' }));
  return screen.findByRole('dialog', { name: 'Create a school' });
}

const fillValid = () => {
  type('School name', 'Greenfield College');
  type('Owner name', 'Funmi Adeyemi');
  type('Owner email', 'funmi@greenfield.test');
};

const submit = (sheet: HTMLElement) => {
  fireEvent.click(within(sheet).getByRole('button', { name: 'Create school' }));
};

describe('CreateSchoolSheet', () => {
  it('suggests the slug and prefix from the name until they are edited', async () => {
    setup(vi.fn());
    const sheet = await openSheet();
    expect(
      within(sheet).getByText(
        'The school, its owner and six starter roles are created in one step.'
      )
    ).toBeInTheDocument();

    type('School name', 'Greenfield College');
    expect(screen.getByLabelText('Slug')).toHaveValue('greenfield-college');
    expect(screen.getByLabelText('Admission prefix')).toHaveValue('GC');

    type('Slug', 'gfc');
    type('School name', 'Greenfield College Lekki');
    expect(screen.getByLabelText('Slug')).toHaveValue('gfc');
    expect(screen.getByLabelText('Admission prefix')).toHaveValue('GCL');
  });

  it('explains what is wrong before it calls the server', async () => {
    const { create } = setup(vi.fn());
    const sheet = await openSheet();
    type('School name', 'Greenfield College');
    type('Slug', 'Bad Slug!');
    type('Admission prefix', 'g1');
    submit(sheet);

    expect(
      await screen.findByText('Use lowercase letters, numbers and hyphens.')
    ).toBeInTheDocument();
    expect(screen.getByText('Use 2 to 6 capital letters.')).toBeInTheDocument();
    expect(screen.getByText('Enter the owner’s name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email.')).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows a taken slug in the form and keeps the sheet open', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, { code: 'Conflict', message: 'That slug is taken.' })
      );
    setup(create);
    const sheet = await openSheet();
    fillValid();
    submit(sheet);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That slug is taken.'
    );
    expect(
      screen.getByRole('dialog', { name: 'Create a school' })
    ).toBeInTheDocument();
  });

  it('shows the temporary password once, with Copy, then refetches the list', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { list, create } = setup(vi.fn().mockResolvedValue(created()));
    const sheet = await openSheet();
    fillValid();
    type('City', 'Lagos');
    submit(sheet);

    const dialog = await screen.findByRole('dialog', {
      name: 'Greenfield College created',
    });
    expect(create).toHaveBeenCalledWith({
      body: {
        name: 'Greenfield College',
        slug: 'greenfield-college',
        admissionPrefix: 'GC',
        city: 'Lagos',
        ownerName: 'Funmi Adeyemi',
        ownerEmail: 'funmi@greenfield.test',
      },
    });
    expect(
      within(dialog).getByText(
        'Give the owner this temporary password. They choose their own at first sign-in. It won’t be shown again.'
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('funmi@greenfield.test')
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Tmp9Pass2Word')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Tmp9Pass2Word');
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByText('Tmp9Pass2Word')).not.toBeInTheDocument();
    });
    expect(list.mock.calls.length).toBeGreaterThan(1);
  });

  it('says so when the clipboard refuses the copy', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    setup(vi.fn().mockResolvedValue(created()));
    const sheet = await openSheet();
    fillValid();
    submit(sheet);

    const dialog = await screen.findByRole('dialog', {
      name: 'Greenfield College created',
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Couldn’t copy'
    );
    expect(within(dialog).getByText('Tmp9Pass2Word')).toBeInTheDocument();
  });

  it('says an existing owner already has an account', async () => {
    setup(vi.fn().mockResolvedValue(created({ temporaryPassword: null })));
    const sheet = await openSheet();
    fillValid();
    submit(sheet);

    const dialog = await screen.findByRole('dialog', {
      name: 'Greenfield College created',
    });
    expect(
      within(dialog).getByText(
        'funmi@greenfield.test already has an account and is now the owner.'
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Copy' })
    ).not.toBeInTheDocument();
  });

  it('keeps the temporary password open through Escape and an outside click', async () => {
    setup(vi.fn().mockResolvedValue(created()));
    const sheet = await openSheet();
    fillValid();
    submit(sheet);

    const dialog = await screen.findByRole('dialog', {
      name: 'Greenfield College created',
    });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    expect(
      screen.getByRole('dialog', { name: 'Greenfield College created' })
    ).toBeInTheDocument();
    expect(screen.getByText('Tmp9Pass2Word')).toBeInTheDocument();
  });

  it('starts empty each time the sheet is opened', async () => {
    setup(vi.fn());
    const sheet = await openSheet();
    type('School name', 'Greenfield College');
    type('City', 'Lagos');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Create a school' })
      ).not.toBeInTheDocument();
    });

    await openSheet();
    expect(screen.getByLabelText('School name')).toHaveValue('');
    expect(screen.getByLabelText('Slug')).toHaveValue('');
    expect(screen.getByLabelText('Admission prefix')).toHaveValue('');
    expect(screen.getByLabelText('City')).toHaveValue('');
  });
});
