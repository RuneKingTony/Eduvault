import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { toast } from '@eduvault/ui';
import { ApiError, type MePermissions } from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import { fakeAccess, renderWithApi } from '../test-utils';
import { ARM_ID, preview, studentDetail } from '../test-students';
import { AdmitStudentSheet } from './admit-student-sheet';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const accessWith = (...permissions: Permission[]): MePermissions =>
  fakeAccess({
    roles: ['custom'],
    permissions: toPermissionMap(permissions),
    campusScope: 'all',
  });

const ADMITTER: Permission[] = [
  'student:create',
  'guardian:link',
  'guardian:create',
  'guardian:read',
  'session:read',
];

function setup(
  options: {
    preview?: ReturnType<typeof preview> | Error;
    access?: MePermissions;
    matches?: {
      name: string;
      state: string;
      studentId?: string;
      admissionNumber?: string;
    }[];
    create?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const previewValue = options.preview ?? preview();
  const api = {
    admissions: {
      preview:
        previewValue instanceof Error
          ? vi.fn().mockRejectedValue(previewValue)
          : vi.fn().mockResolvedValue(previewValue),
      duplicates: vi.fn().mockResolvedValue({ matches: options.matches ?? [] }),
    },
    students: {
      create:
        options.create ??
        vi.fn().mockResolvedValue({ student: studentDetail(), logins: [] }),
    },
    guardians: { list: vi.fn().mockResolvedValue([]) },
  };
  const handlers = {
    onOpenChange: vi.fn(),
    onAdmitted: vi.fn(),
    onOpenCalendar: vi.fn(),
  };
  renderWithApi(
    <AdmitStudentSheet open {...handlers} />,
    api,
    options.access ?? accessWith(...ADMITTER)
  );
  return { api, ...handlers };
}

const fillStudent = async () => {
  fireEvent.change(await screen.findByLabelText('First name'), {
    target: { value: 'Peace' },
  });
  fireEvent.change(screen.getByLabelText('Last name'), {
    target: { value: 'Udoh' },
  });
  fireEvent.change(screen.getByLabelText('Date of birth'), {
    target: { value: '2014-03-03' },
  });
};

const next = () => {
  fireEvent.click(screen.getByRole('button', { name: /Next/ }));
};

const fillGuardian = () => {
  fireEvent.change(screen.getByLabelText('Full name'), {
    target: { value: 'Mrs Udoh' },
  });
  fireEvent.change(screen.getByLabelText('Phone'), {
    target: { value: '08012345678' },
  });
  fireEvent.change(screen.getByLabelText('House address'), {
    target: { value: '4 Palm Close' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'udoh@example.test' },
  });
};

const toGuardianStep = async () => {
  await fillStudent();
  next();
  await screen.findByLabelText('Class for First term');
  next();
};

describe('AdmitStudentSheet step 1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the four steps and the student fields', async () => {
    setup();
    expect(await screen.findByLabelText('First name')).toBeInTheDocument();
    for (const step of ['student', 'class', 'guardian', 'review']) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Gender')).toHaveValue('F');
  });

  it('refuses blanks with the server copy and does not advance', async () => {
    setup();
    await screen.findByLabelText('First name');
    next();
    expect(screen.getByText('Enter the first name.')).toBeInTheDocument();
    expect(screen.getByText('Enter the last name.')).toBeInTheDocument();
    expect(
      screen.getByText('Choose a date of birth on or before today.')
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Class for First term')
    ).not.toBeInTheDocument();
  });
});

describe('AdmitStudentSheet step 2', () => {
  it('names the term and year and offers the classes with the first selected', async () => {
    setup();
    await fillStudent();
    next();
    const select = await screen.findByLabelText('Class for First term');
    expect(select).toHaveValue(ARM_ID);
    expect(
      within(select).getByRole('option', { name: 'JSS 2 Emerald · Ikeja' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Creates their 2026/2027 enrolment and a First term placement.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Admitted mid-term? The bursar can charge this student on their own.'
      )
    ).toBeInTheDocument();
  });

  it('keeps what was typed when going Back', async () => {
    setup();
    await fillStudent();
    next();
    await screen.findByLabelText('Class for First term');
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByLabelText('First name')).toHaveValue('Peace');
    expect(screen.getByLabelText('Last name')).toHaveValue('Udoh');
    expect(screen.getByLabelText('Date of birth')).toHaveValue('2014-03-03');
  });

  it('says there are no classes and disables Next', async () => {
    setup({ preview: preview({ classes: [] }) });
    await fillStudent();
    next();
    expect(
      await screen.findByText(
        'No classes on your campuses yet. Add a class first.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });
});

describe('AdmitStudentSheet with no current term', () => {
  it('shows the warning and a link to School years and terms', async () => {
    const { onOpenCalendar } = setup({
      preview: new ApiError(409, {
        code: 'Conflict',
        message: 'Set a current term before admitting students.',
      }),
    });
    expect(
      await screen.findByText('Set a current term before admitting students.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Next/ })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'School years and terms' })
    );
    expect(onOpenCalendar).toHaveBeenCalled();
  });

  it('hides the link without session:read', async () => {
    setup({
      preview: new ApiError(409, { code: 'Conflict', message: 'x' }),
      access: accessWith('student:create', 'guardian:link', 'guardian:create'),
    });
    await screen.findByText('Set a current term before admitting students.');
    expect(
      screen.queryByRole('button', { name: 'School years and terms' })
    ).not.toBeInTheDocument();
  });
});

describe('AdmitStudentSheet step 3', () => {
  it('starts with Guardian 1 as a new guardian with the email login and no Remove while one is required', async () => {
    setup();
    await toGuardianStep();
    expect(await screen.findByText('Guardian 1')).toBeInTheDocument();
    expect(screen.getByLabelText('New guardian')).toBeChecked();
    expect(screen.getByLabelText(/With their email/)).toBeChecked();
    expect(
      screen.getByLabelText('Pays the school fees (receives the charges)')
    ).toBeChecked();
    expect(
      screen.queryByRole('button', { name: /Remove/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 of 4')).toBeInTheDocument();
  });

  it('lets Guardian 1 go when a guardian is not required and then shows the empty callout', async () => {
    setup({ preview: preview({ requireGuardian: false }) });
    await toGuardianStep();
    fireEvent.click(await screen.findByRole('button', { name: /Remove/ }));
    expect(
      screen.getByText(
        'No guardian for now. You can add one later from the student’s row.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add a guardian now' })
    ).toBeInTheDocument();
  });

  it('adds another guardian as an existing father who does not pay, then stops at the maximum', async () => {
    setup({ preview: preview({ maxGuardians: 2 }) });
    await toGuardianStep();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add another guardian' })
    );
    expect(await screen.findByText('Guardian 2')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Existing guardian')[1]).toBeChecked();
    expect(
      screen.getByText('A student can have at most 2 guardians.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add another guardian' })
    ).not.toBeInTheDocument();
  });

  it('toasts when an existing guardian is not chosen and stays on the step', async () => {
    setup();
    await toGuardianStep();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add another guardian' })
    );
    next();
    expect(toast.error).toHaveBeenCalledWith(
      'Choose the existing guardian, or switch to New guardian.'
    );
    expect(screen.getByText('Guardian 1')).toBeInTheDocument();
  });

  it('asks for the new guardian fields before the review', async () => {
    setup();
    await toGuardianStep();
    next();
    expect(
      await screen.findByText('Enter the guardian’s full name.')
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a phone number.')).toBeInTheDocument();
    expect(screen.getByText('Enter the house address.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email.')).toBeInTheDocument();
  });

  it('shows only the permission callout without guardian:link', async () => {
    setup({
      preview: preview({ requireGuardian: false }),
      access: accessWith('student:create', 'session:read'),
    });
    await toGuardianStep();
    expect(
      await screen.findByText(
        /You can’t link guardians\. Someone with guardian permissions/
      )
    ).toBeInTheDocument();
    expect(screen.queryByText('Guardian 1')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Add/ })
    ).not.toBeInTheDocument();
  });

  it('disables New guardian without guardian:create and starts existing', async () => {
    setup({
      access: accessWith('student:create', 'guardian:link', 'guardian:read'),
    });
    await toGuardianStep();
    expect(await screen.findByLabelText('New guardian')).toBeDisabled();
    expect(screen.getByLabelText('Existing guardian')).toBeChecked();
  });
});

const toReview = async () => {
  await toGuardianStep();
  fillGuardian();
  next();
  await screen.findByText('Student login');
};

describe('AdmitStudentSheet step 4', () => {
  it('reviews the student, the class, the login and each guardian with its login note', async () => {
    setup();
    await toReview();
    expect(screen.getByText('Peace Udoh')).toBeInTheDocument();
    expect(screen.getByText('3 Mar 2014')).toBeInTheDocument();
    expect(screen.getByText('JSS 2 Gold · Lekki')).toBeInTheDocument();
    expect(screen.getByText('greenfield-0234')).toBeInTheDocument();
    expect(screen.getByText('Mrs Udoh')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Mother · Signs in with udoh@example.test and a temporary password.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Admit and enrol' })
    ).toBeInTheDocument();
  });

  it('warns about a possible duplicate and relabels the button Admit anyway', async () => {
    setup({
      matches: [
        {
          name: 'Peace Udoh',
          state: 'Active',
          studentId: 'st-9',
          admissionNumber: 'GF-0200',
        },
        { name: 'Peace Udoh', state: 'Left' },
      ],
    });
    await toReview();
    expect(
      await screen.findByText('This may be a student you already have')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GF-0200' })).toHaveAttribute(
      'href',
      '/students/st-9'
    );
    expect(screen.getByText(/on another campus/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Students are never deleted, so a duplicate can only be recorded as left/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Admit anyway' })
    ).toBeInTheDocument();
  });

  it('makes Guardian 1 the payer when nobody pays and sends the admission body', async () => {
    const create = vi
      .fn()
      .mockResolvedValue({ student: studentDetail(), logins: [] });
    const { onAdmitted } = setup({ create });
    await toGuardianStep();
    fireEvent.click(
      screen.getByLabelText('Pays the school fees (receives the charges)')
    );
    fillGuardian();
    next();
    await screen.findByText('Student login');
    expect(screen.getByText('Pays fees')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Admit and enrol' }));
    await waitFor(() => {
      expect(create).toHaveBeenCalled();
    });
    expect(create.mock.calls[0]?.[0].body).toMatchObject({
      firstName: 'Peace',
      lastName: 'Udoh',
      gender: 'F',
      dateOfBirth: '2014-03-03',
      classArmId: ARM_ID,
      guardians: [
        {
          new: {
            fullName: 'Mrs Udoh',
            paysFees: true,
            login: { kind: 'email', email: 'udoh@example.test' },
          },
        },
      ],
    });
    await waitFor(() => {
      expect(onAdmitted).toHaveBeenCalled();
    });
  });

  it('shows the server message and stays on the review step when the admission fails', async () => {
    const create = vi.fn().mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message:
          'udoh@example.test already belongs to Ngozi. Link the existing guardian instead.',
      })
    );
    setup({ create });
    await toReview();
    fireEvent.click(screen.getByRole('button', { name: 'Admit and enrol' }));
    expect(
      await screen.findByText(/already belongs to Ngozi/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Admit and enrol' })
    ).toBeInTheDocument();
  });
});
