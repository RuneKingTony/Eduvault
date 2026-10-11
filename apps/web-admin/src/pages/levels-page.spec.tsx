import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  actingAccess,
  ownerAccess,
  renderWithApi,
  starterAccess,
} from '../test-utils';
import { IDS, classLevel, ladder } from '../test-classes';
import { LevelsPage } from './levels-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

type Access = Parameters<typeof renderWithApi>[2];

function setup(access: Access = starterAccess('administrator')) {
  const classLevels = {
    list: vi.fn().mockResolvedValue(ladder()),
    create: vi.fn().mockResolvedValue(classLevel({ name: 'Creche' })),
    update: vi.fn().mockResolvedValue(classLevel({ name: 'Year 1' })),
  };
  renderWithApi(<LevelsPage />, { classLevels }, access);
  return classLevels;
}

const rowOf = async (name: string) => {
  await screen.findByText('Primary 1');
  const row = screen
    .getAllByRole('row')
    .find(
      (candidate) =>
        within(candidate).queryAllByRole('cell')[1]?.textContent === name
    );
  if (row === undefined) {
    throw new Error(`no row for ${name}`);
  }
  return within(row);
};

const openMenu = async (name: string) => {
  const row = await rowOf(name);
  fireEvent.keyDown(row.getByRole('button', { name: `Actions for ${name}` }), {
    key: 'Enter',
  });
};

describe('LevelsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the levels by sequence with Final year for the last', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: 'Levels' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Year groups every campus uses, in order. The last one is the final year.'
      )
    ).toBeInTheDocument();
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
    expect(names).toEqual(['Primary 1', 'JSS 1', 'SS 3']);
    expect((await rowOf('Primary 1')).getByText('JSS 1')).toBeInTheDocument();
    expect((await rowOf('SS 3')).getByText('Final year')).toBeInTheDocument();
    expect(screen.getByText('SS3')).toBeInTheDocument();
  });

  it('gives a class:update holder Add, Edit and the move controls', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'Add level' })
    ).toBeInTheDocument();
    await openMenu('JSS 1');
    expect(
      await screen.findByRole('menuitem', { name: 'Edit' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Move up' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Move down' })
    ).toBeInTheDocument();
  });

  it.each([
    ['a reader with class:read only', starterAccess('principal')],
    ['a read-only acting super admin', actingAccess(false)],
  ])('hides every write control for %s', async (_label, access) => {
    setup(access);
    expect(await screen.findByText('Primary 1')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add level' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Actions for/ })
    ).not.toBeInTheDocument();
  });

  it('moves a level up or down by one place and refuses to move past the ends', async () => {
    const levels = setup(ownerAccess());
    await openMenu('JSS 1');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move up' }));
    await waitFor(() => {
      expect(levels.update).toHaveBeenCalledWith({
        params: { id: IDS.jss1 },
        body: { sequence: 1 },
      });
    });
    await openMenu('JSS 1');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move down' }));
    await waitFor(() => {
      expect(levels.update).toHaveBeenLastCalledWith({
        params: { id: IDS.jss1 },
        body: { sequence: 3 },
      });
    });
    await openMenu('Primary 1');
    expect(
      await screen.findByRole('menuitem', { name: 'Move up' })
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('adds a level with its code in capitals and toasts', async () => {
    const levels = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add level' }));
    fireEvent.change(await screen.findByLabelText('Code'), {
      target: { value: 'cre' },
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Creche' },
    });
    fireEvent.change(screen.getByLabelText('Next level'), {
      target: { value: IDS.p1 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add level' }));
    await waitFor(() => {
      expect(levels.create).toHaveBeenCalledWith({
        body: { code: 'CRE', name: 'Creche', nextLevelId: IDS.p1 },
      });
      expect(toast.success).toHaveBeenCalledWith('Creche added.');
    });
  });

  it('offers Final year first in the next-level select and sends null for it', async () => {
    const levels = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add level' }));
    const next = await screen.findByLabelText<HTMLSelectElement>('Next level');
    expect(within(next).getAllByRole('option')[0]).toHaveTextContent(
      'Final year'
    );
    fireEvent.change(await screen.findByLabelText('Code'), {
      target: { value: 'A1' },
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Alumni' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add level' }));
    await waitFor(() => {
      expect(levels.create).toHaveBeenCalledWith({
        body: { code: 'A1', name: 'Alumni', nextLevelId: null },
      });
    });
  });

  it('shows a taken code inline and keeps the dialog open', async () => {
    const levels = setup();
    levels.create.mockRejectedValue(
      new ApiError(409, { code: 'Conflict', message: 'CRE already exists.' })
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Add level' }));
    fireEvent.change(await screen.findByLabelText('Code'), {
      target: { value: 'CRE' },
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Creche' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add level' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'CRE already exists.'
    );
    expect(screen.getByLabelText('Code')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('refuses a bad code before calling the API', async () => {
    const levels = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add level' }));
    fireEvent.change(await screen.findByLabelText('Code'), {
      target: { value: 'x' },
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Creche' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add level' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Use 2 to 8 capital letters or digits, for example JSS1.'
    );
    expect(levels.create).not.toHaveBeenCalled();
  });

  it('edits a level without its code and shows a self-reference refusal inline', async () => {
    const levels = setup();
    levels.update.mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message: 'A level can’t lead to itself.',
      })
    );
    await openMenu('JSS 1');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    expect(await screen.findByLabelText('Name')).toHaveValue('JSS 1');
    expect(screen.queryByLabelText('Code')).not.toBeInTheDocument();
    const next = screen.getByLabelText<HTMLSelectElement>('Next level');
    expect(
      within(next).queryByRole('option', { name: 'JSS 1' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A level can’t lead to itself.'
    );
  });

  it('saves an edit and toasts the saved name', async () => {
    const levels = setup();
    await openMenu('JSS 1');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Year 1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(levels.update).toHaveBeenCalledWith({
        params: { id: IDS.jss1 },
        body: { name: 'Year 1', nextLevelId: IDS.ss3 },
      });
      expect(toast.success).toHaveBeenCalledWith('Year 1 saved.');
    });
  });
});
