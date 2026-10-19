import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from '@eduvault/ui';
import { toPermissionMap } from '@eduvault/policy';
import { fakeAccess, renderWithApi } from '../test-utils';
import {
  ARM_ID,
  ARM_J3,
  EFE_ID,
  STUDENT_ID,
  TOBI_ID,
  YEAR_2027_ID,
  newSchoolYearPreview,
} from '../test-students';
import { StartYearDialog } from './start-year-dialog';

function setup(
  options: {
    preview?: ReturnType<typeof newSchoolYearPreview>;
    start?: ReturnType<typeof vi.fn>;
    permissions?: Parameters<typeof toPermissionMap>[0];
  } = {}
) {
  const students = {
    newSchoolYearPreview: vi
      .fn()
      .mockResolvedValue(options.preview ?? newSchoolYearPreview()),
    startNewSchoolYear:
      options.start ??
      vi.fn(({ body }: { body: { rows: { outcome: string }[] } }) => {
        const count = (outcome: string) =>
          body.rows.filter((row) => row.outcome === outcome).length;
        return Promise.resolve({
          moved: count('move'),
          repeating: count('repeat'),
          graduated: count('graduate'),
          skipped: 0,
        });
      }),
  };
  const onOpenChange = vi.fn();
  const onOpenCalendar = vi.fn();
  renderWithApi(
    <StartYearDialog
      onOpenChange={onOpenChange}
      onOpenCalendar={onOpenCalendar}
    />,
    { students },
    fakeAccess({
      roles: ['custom'],
      permissions: toPermissionMap(
        options.permissions ?? [
          'enrollment:place',
          'student:archive',
          'session:read',
        ]
      ),
      campusScope: 'all',
    })
  );
  return { students, onOpenChange, onOpenCalendar };
}

const confirm = () => screen.findByRole('button', { name: 'Start 2027/2028' });

describe('StartYearDialog', () => {
  it('shows a loading state, then one group per class with everyone ticked', async () => {
    setup();
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(
      await screen.findByText('Start 2027/2028', {
        selector: '[data-slot="dialog-title"]',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ticked students move up a level for 2027/2028. Untick anyone repeating the year. Final-year students graduate.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('JSS 2 Gold (Lekki)')).toBeInTheDocument();
    expect(screen.getByText('JSS 3 Gold')).toBeInTheDocument();
    expect(screen.getByText('SS 3 Blue (Ikeja)')).toBeInTheDocument();
    expect(screen.getByText('Graduate')).toBeInTheDocument();
    expect(screen.getByText('2 students')).toBeInTheDocument();
    expect(screen.getByText('1 student')).toBeInTheDocument();
    for (const box of screen.getAllByRole('checkbox')) {
      expect(box).toBeChecked();
    }
    expect(
      screen.getByText('2 move up · 0 repeat · 1 graduate')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Old year’s charges stay on Who owes.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 inactive: Uche Mba. Not moved. Mark them back in school to include them, or record their leaving.'
      )
    ).toBeInTheDocument();
  });

  it('marks an unticked student as repeating and updates the summary live', async () => {
    setup();
    fireEvent.click(await screen.findByLabelText(/Tobi Lawal/));
    expect(await screen.findByText(/\(repeats JSS 2\)/)).toBeInTheDocument();
    expect(
      screen.getByText('1 move up · 1 repeat · 1 graduate')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Tobi Lawal/));
    expect(
      screen.getByText('2 move up · 0 repeat · 1 graduate')
    ).toBeInTheDocument();
  });

  it('requires a class when none shares the name and disables the confirm button', async () => {
    const preview = newSchoolYearPreview();
    const [gold, blue] = preview.groups;
    setup({
      preview: {
        ...preview,
        groups: [
          {
            ...gold!,
            toClass: null,
            classChoices: [
              { id: ARM_J3, name: 'JSS 3 Gold', campusName: 'Lekki' },
            ],
          },
          blue!,
        ],
      },
    });
    expect(
      await screen.findByText('Choose a class for JSS 2 Gold (Lekki).')
    ).toBeInTheDocument();
    expect(await confirm()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Choose a JSS 3 class'), {
      target: { value: ARM_J3 },
    });
    expect(
      screen.queryByText('Choose a class for JSS 2 Gold (Lekki).')
    ).not.toBeInTheDocument();
    expect(await confirm()).toBeEnabled();
  });

  it('asks for a class for those repeating when the current class is archived', async () => {
    const preview = newSchoolYearPreview();
    const [gold, blue] = preview.groups;
    setup({
      preview: {
        ...preview,
        groups: [
          {
            ...gold!,
            fromClass: gold!.fromClass && {
              ...gold!.fromClass,
              archived: true,
            },
            repeatClassChoices: [
              { id: ARM_ID, name: 'JSS 2 Silver', campusName: 'Lekki' },
            ],
          },
          blue!,
        ],
      },
    });
    fireEvent.click(await screen.findByLabelText(/Tobi Lawal/));
    expect(
      await screen.findByText(
        'Choose a class for those repeating in JSS 2 Gold (Lekki).'
      )
    ).toBeInTheDocument();
    expect(await confirm()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Class for those repeating'), {
      target: { value: ARM_ID },
    });
    expect(await confirm()).toBeEnabled();
  });

  it('locks final-year groups without student:archive and leaves them out', async () => {
    setup({
      preview: { ...newSchoolYearPreview(), canGraduate: false },
      permissions: ['enrollment:place'],
    });
    expect(
      await screen.findByText(
        'Graduating needs permission to record leavers. These students stay as they are for now.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Efe Ade/)).not.toBeInTheDocument();
    expect(
      screen.getByText('2 move up · 0 repeat · 0 graduate')
    ).toBeInTheDocument();
  });

  it('says how many students are already in the new year', async () => {
    setup({ preview: { ...newSchoolYearPreview(), alreadyInTargetYear: 3 } });
    expect(
      await screen.findByText(
        '3 students are already in 2027/2028 and not listed.'
      )
    ).toBeInTheDocument();
  });

  it('starts the year with a move, a repeat and a graduate, then toasts with a link to the calendar', async () => {
    const success = vi.spyOn(toast, 'success').mockReturnValue(1);
    const { students, onOpenChange, onOpenCalendar } = setup();
    fireEvent.click(await screen.findByLabelText(/Tobi Lawal/));
    fireEvent.click(await confirm());
    await waitFor(() => {
      expect(students.startNewSchoolYear).toHaveBeenCalledWith({
        body: {
          targetYearId: YEAR_2027_ID,
          rows: [
            { studentId: STUDENT_ID, outcome: 'move', classArmId: ARM_J3 },
            { studentId: TOBI_ID, outcome: 'repeat', classArmId: ARM_ID },
            { studentId: EFE_ID, outcome: 'graduate' },
          ],
        },
      });
    });
    await waitFor(() => {
      expect(success).toHaveBeenCalled();
    });
    const [message, options] = success.mock.calls[0] ?? [];
    expect(message).toBe(
      '2027/2028 started: 1 moved up, 1 repeating, 1 graduated. Their new classes show once First term is made current.'
    );
    const action = (
      options as { action: { label: string; onClick: () => void } }
    ).action;
    expect(action.label).toBe('School years and terms');
    action.onClick();
    expect(onOpenCalendar).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('toasts the server message and stays open', async () => {
    const error = vi.spyOn(toast, 'error').mockReturnValue(1);
    const start = vi.fn().mockRejectedValue(new Error('Choose a JSS 3 class.'));
    const { onOpenChange } = setup({ start });
    fireEvent.click(await confirm());
    await waitFor(() => {
      expect(error).toHaveBeenCalledWith('Choose a JSS 3 class.');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('shows the server message when there is no school year to start', async () => {
    const setupFailure = () => {
      const students = {
        newSchoolYearPreview: vi
          .fn()
          .mockRejectedValue(
            new Error(
              'There is no school year to start. Create the next school year first.'
            )
          ),
      };
      renderWithApi(
        <StartYearDialog onOpenChange={vi.fn()} onOpenCalendar={vi.fn()} />,
        { students }
      );
    };
    setupFailure();
    expect(
      await screen.findByText(
        'There is no school year to start. Create the next school year first.'
      )
    ).toBeInTheDocument();
  });
});
