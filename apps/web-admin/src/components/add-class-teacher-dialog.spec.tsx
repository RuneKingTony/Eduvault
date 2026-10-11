import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { IDS, classDetail, teacher } from '../test-classes';
import { renderWithApi } from '../test-utils';
import { AddClassTeacherDialog } from './add-class-teacher-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const CANDIDATES = [
  { userId: IDS.ayo, name: 'Ayo Bassey' },
  { userId: IDS.claire, name: 'Claire Ade' },
];

function setup({
  candidates = CANDIDATES,
  classTeachers = [] as ReturnType<typeof teacher>[],
} = {}) {
  const api = {
    classes: {
      teacherCandidates: vi.fn().mockResolvedValue(candidates),
      assignTeacher: vi.fn().mockResolvedValue({
        userId: IDS.claire,
        name: 'Claire Ade',
        role: 'assistant',
      }),
    },
  };
  const onOpenChange = vi.fn();
  renderWithApi(
    <AddClassTeacherDialog
      classRow={classDetail({ displayName: 'JSS 2 Gold', classTeachers })}
      open
      onOpenChange={onOpenChange}
    />,
    api
  );
  return { api, onOpenChange };
}

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Add class teacher' }));

const roleOptions = () =>
  within(screen.getByLabelText('Role'))
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('AddClassTeacherDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains itself and lists the candidates with the campus hint', async () => {
    setup();
    expect(
      await screen.findByText('Add class teacher', {
        selector: '[data-slot="dialog-title"]',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A class can have several class teachers. Being one gives that teacher access to this class.'
      )
    ).toBeInTheDocument();
    const select = await screen.findByLabelText('Teacher');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Choose a teacher', 'Ayo Bassey', 'Claire Ade']);
    expect(select).toHaveValue('');
    expect(
      screen.getByText('Only teachers on the Lekki campus are listed.')
    ).toBeInTheDocument();
  });

  it('says so when there is nobody to add', async () => {
    setup({ candidates: [] });
    expect(
      await screen.findByText(
        'No teachers on the Lekki campus yet. Add one under People first.'
      )
    ).toBeInTheDocument();
  });

  it('defaults the role to Assistant and offers Lead while the class has none', async () => {
    setup();
    await screen.findByLabelText('Teacher');
    expect(screen.getByLabelText('Role')).toHaveValue('assistant');
    expect(roleOptions()).toEqual(['Lead', 'Assistant', 'Uniform']);
  });

  it('leaves Lead out once the class has a lead', async () => {
    setup({ classTeachers: [teacher('Ayo Bassey')] });
    await screen.findByLabelText('Teacher');
    expect(roleOptions()).toEqual(['Assistant', 'Uniform']);
  });

  it('still offers Lead when the class has only assistants', async () => {
    setup({ classTeachers: [teacher('Claire Ade', 'assistant')] });
    await screen.findByLabelText('Teacher');
    expect(roleOptions()).toContain('Lead');
  });

  it('asks for a teacher before calling the API', async () => {
    const { api } = setup();
    await screen.findByLabelText('Teacher');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a teacher.'
    );
    expect(api.classes.assignTeacher).not.toHaveBeenCalled();
  });

  it('adds the teacher, toasts the role in lower case and closes', async () => {
    const { api, onOpenChange } = setup();
    fireEvent.change(await screen.findByLabelText('Teacher'), {
      target: { value: IDS.claire },
    });
    submit();
    await waitFor(() => {
      expect(api.classes.assignTeacher).toHaveBeenCalledWith({
        params: { id: IDS.gold },
        body: { userId: IDS.claire, role: 'assistant' },
      });
      expect(toast.success).toHaveBeenCalledWith(
        'Claire Ade added as assistant class teacher.'
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('sends the chosen role', async () => {
    const { api } = setup();
    fireEvent.change(await screen.findByLabelText('Teacher'), {
      target: { value: IDS.ayo },
    });
    fireEvent.change(screen.getByLabelText('Role'), {
      target: { value: 'lead' },
    });
    submit();
    await waitFor(() => {
      expect(api.classes.assignTeacher).toHaveBeenCalledWith({
        params: { id: IDS.gold },
        body: { userId: IDS.ayo, role: 'lead' },
      });
    });
  });

  it.each([
    [409, 'Conflict', 'Ayo Bassey is already a class teacher of JSS 2 Gold.'],
    [
      409,
      'Conflict',
      'JSS 2 Gold already has a lead class teacher: Ayo Bassey.',
    ],
    [
      409,
      'Conflict',
      'JSS 2 Gold is archived. Restore it before adding teachers.',
    ],
    [
      400,
      'BadRequest',
      'Only teachers on the Lekki campus can be class teachers of this class.',
    ],
  ] as const)(
    'shows the API message "%s %s %s" inline and stays open',
    async (status, code, message) => {
      const { api, onOpenChange } = setup();
      api.classes.assignTeacher.mockRejectedValue(
        new ApiError(status, { code, message })
      );
      fireEvent.change(await screen.findByLabelText('Teacher'), {
        target: { value: IDS.ayo },
      });
      submit();
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    }
  );
});
