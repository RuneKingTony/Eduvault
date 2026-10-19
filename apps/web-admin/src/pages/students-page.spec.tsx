import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { MePermissions } from '@eduvault/api-contract';
import { toPermissionMap, type Permission } from '@eduvault/policy';
import {
  actingAccess,
  fakeAccess,
  renderWithApi,
  starterAccess,
} from '../test-utils';
import { testId } from '../test-api';
import { classLevel, classSummary } from '../test-classes';
import { currentCalendar } from '../test-calendar';
import { IKEJA, IKEJA_ID, LEKKI } from '../test-members';
import { profile, settings as schoolSettings } from '../test-school';
import {
  ARM_ID,
  STUDENT_ID,
  TOBI_ID,
  UCHE_ID,
  YEAR_2027_ID,
  counts,
  guardianLink,
  newSchoolYearPreview,
  preview,
  studentList,
  studentRow,
} from '../test-students';
import { StudentsPage } from './students-page';

const LEVEL_ID = testId(0x2_00_01);
const ZAINAB_ID = testId(0x2_00_02);
const KUNLE_ID = testId(0x2_00_03);
const BOLA_ID = testId(0x2_00_04);
const CHIDI_ID = testId(0x2_00_05);
const DARA_ID = testId(0x2_00_06);
const BARE_ID = testId(0x2_00_07);
const KID_ID = (index: number) => testId(0x2_01_00 + index);

const ada = studentRow();
const ifeoma = studentRow({
  id: TOBI_ID,
  firstName: 'Ifeoma',
  lastName: 'Nnaji',
  admissionNumber: 'GF-0140',
  payers: ['Ngozi Okeke', 'Bayo Adewale'],
});

const accessWith = (...permissions: Permission[]): MePermissions =>
  fakeAccess({
    roles: ['custom'],
    permissions: toPermissionMap(permissions),
    campusScope: 'all',
  });

function setup(
  options: {
    props?: Partial<Parameters<typeof StudentsPage>[0]>;
    access?: MePermissions;
    list?: ReturnType<typeof studentList>;
    campuses?: unknown[];
    classes?: unknown[];
    settings?: { maxGuardians: number; requireGuardian: boolean };
  } = {}
) {
  const students = {
    list: vi.fn().mockResolvedValue(options.list ?? studentList([ada, ifeoma])),
    guardians: vi.fn().mockResolvedValue([guardianLink()]),
    newSchoolYearPreview: vi.fn().mockResolvedValue(newSchoolYearPreview()),
    startNewSchoolYear: vi.fn(),
  };
  const api = {
    students,
    campuses: {
      list: vi.fn().mockResolvedValue(options.campuses ?? [LEKKI, IKEJA]),
    },
    classLevels: {
      list: vi.fn().mockResolvedValue([
        classLevel({
          id: LEVEL_ID,
          code: 'JSS1',
          name: 'JSS 1',
          sequence: 7,
          isFinalYear: false,
        }),
      ]),
    },
    classes: { list: vi.fn().mockResolvedValue(options.classes ?? []) },
    admissions: { preview: vi.fn().mockResolvedValue(preview()) },
    schoolAccount: {
      get: vi.fn().mockResolvedValue(profile({ admissionPrefix: 'GF' })),
    },
    schoolSettings: {
      get: vi.fn().mockResolvedValue(schoolSettings(options.settings)),
    },
    calendar: {
      current: vi.fn().mockResolvedValue(currentCalendar()),
    },
    guardians: { list: vi.fn().mockResolvedValue([]) },
  };
  const handlers = {
    onSearchChange: vi.fn(),
    onOpenStudent: vi.fn(),
    onRecordLeaving: vi.fn(),
    onAdmitted: vi.fn(),
    onOpenCalendar: vi.fn(),
  };
  renderWithApi(
    <StudentsPage
      search={{}}
      schoolName="Greenfield College"
      {...handlers}
      {...options.props}
    />,
    api,
    options.access
  );
  return { students, api, ...handlers };
}

describe('StudentsPage', () => {
  it('shows the scope note, the shown count, the tabs with counts and each student', async () => {
    setup();
    expect(
      await screen.findByText('Ada Okeke', { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText('All campuses · 2 shown')).toBeInTheDocument();
    for (const [name, count] of [
      ['Active', 2],
      ['New intakes', 1],
      ['Inactive', 1],
      ['Left', 1],
      ['Graduated', 1],
    ] as const) {
      expect(
        screen.getByRole('tab', { name: `${name} ${count}` })
      ).toBeInTheDocument();
    }
    expect(screen.getByText('GF-0123')).toBeInTheDocument();
    expect(screen.getAllByText('JSS 2 Gold', { selector: 'td' })).toHaveLength(
      2
    );
  });

  it('requests the tab, query, filters and page from the URL search', async () => {
    const { students } = setup({
      props: {
        search: {
          tab: 'inactive',
          q: 'ada',
          campusId: IKEJA_ID,
          levelId: LEVEL_ID,
          page: 2,
        },
      },
    });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(students.list).toHaveBeenCalledWith({
      query: {
        tab: 'inactive',
        q: 'ada',
        campusId: IKEJA_ID,
        levelId: LEVEL_ID,
        page: 2,
      },
    });
  });

  it('reports a tab change and leaves the default tab out of the URL', async () => {
    const { onSearchChange } = setup({
      props: { search: { tab: 'left', page: 2 } },
    });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Active 2' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Active 2' }));
    expect(onSearchChange).toHaveBeenCalledWith({
      tab: undefined,
      page: undefined,
    });
  });

  it('uses the school prefix in the search box and reports typing from page one', async () => {
    const { onSearchChange } = setup({ props: { search: { page: 3 } } });
    const box = await screen.findByPlaceholderText('Search name or GF number');
    fireEvent.change(box, { target: { value: 'ada' } });
    expect(onSearchChange).toHaveBeenCalledWith({ page: undefined, q: 'ada' });
  });

  it('offers the Campus and Level filters, the Campus one only with more than one campus', async () => {
    const { onSearchChange } = setup();
    fireEvent.change(await screen.findByLabelText('Campus'), {
      target: { value: IKEJA.id },
    });
    expect(onSearchChange).toHaveBeenCalledWith({
      campusId: IKEJA.id,
      page: undefined,
    });
    fireEvent.change(await screen.findByLabelText('Level'), {
      target: { value: LEVEL_ID },
    });
    expect(onSearchChange).toHaveBeenCalledWith({
      levelId: LEVEL_ID,
      page: undefined,
    });
  });

  it('hides the Campus filter and column with one campus', async () => {
    setup({ campuses: [LEKKI] });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(screen.queryByLabelText('Campus')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'Campus' })
    ).not.toBeInTheDocument();
  });

  it('shows the Campus column with more than one campus', async () => {
    setup();
    await screen.findByText('Ada Okeke', { exact: false });
    expect(
      screen.getByRole('columnheader', { name: 'Campus' })
    ).toBeInTheDocument();
  });
});

describe('StudentsPage permissions', () => {
  it('gives guardian:read the expand toggle and the Pays fees names', async () => {
    setup({ access: accessWith('student:read', 'guardian:read') });
    expect(
      await screen.findByText('Ngozi Okeke, Bayo Adewale')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Pays fees' })
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /Show guardians of/ })
    ).toHaveLength(2);
  });

  it('hides the expand column and Pays fees without guardian:read', async () => {
    setup({ access: accessWith('student:read') });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(
      screen.queryByRole('columnheader', { name: 'Pays fees' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Show guardians of/ })
    ).not.toBeInTheDocument();
  });

  it('opens the guardians row with the heading, the lines and no Add guardian without guardian:link', async () => {
    setup({ access: accessWith('student:read', 'guardian:read') });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show guardians of Ada Okeke' })
    );
    expect(await screen.findByText('Guardians of Ada')).toBeInTheDocument();
    expect(await screen.findByText('Ngozi Okeke')).toBeInTheDocument();
    expect(screen.getByText('Mother · 0803 456 7890')).toBeInTheDocument();
    expect(screen.getAllByText('Pays fees').length).toBeGreaterThan(1);
    expect(screen.getByText('Email login')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add guardian' })
    ).not.toBeInTheDocument();
  });

  it('offers Add guardian with guardian:link and disables it at the maximum', async () => {
    setup({
      access: accessWith(
        'student:read',
        'guardian:read',
        'guardian:link',
        'schoolAccount:read'
      ),
      settings: { maxGuardians: 1, requireGuardian: true },
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show guardians of Ada Okeke' })
    );
    await screen.findByText('Ngozi Okeke');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Add guardian' })
      ).toBeDisabled();
    });
  });

  it('shows Admit student with student:create, and for a starter administrator', async () => {
    setup({ access: starterAccess('administrator') });
    expect(
      await screen.findByRole('button', { name: 'Admit student' })
    ).toBeInTheDocument();
  });

  it('hides Admit student without student:create', async () => {
    setup({ access: accessWith('student:read') });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(
      screen.queryByRole('button', { name: 'Admit student' })
    ).not.toBeInTheDocument();
  });

  it('hides Admit student without guardian:link while a guardian is required', async () => {
    setup({ access: accessWith('student:read', 'student:create') });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(
      screen.queryByRole('button', { name: 'Admit student' })
    ).not.toBeInTheDocument();
  });

  it('does not open the admit sheet from the admit search flag without guardian:link while a guardian is required', async () => {
    setup({
      access: accessWith('student:read', 'student:create'),
      props: { search: { admit: 1 } },
    });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(screen.queryByText('Admit a student')).not.toBeInTheDocument();
  });

  it('opens the sheet from the button through the admit search flag', async () => {
    const { onSearchChange } = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Admit student' })
    );
    expect(onSearchChange).toHaveBeenCalledWith({ admit: 1 });
  });
});

describe('StudentsPage states', () => {
  it.each([
    ['active', 'No students match', 'Try a different name, campus or level.'],
    ['new', 'No new intakes', 'Nobody admitted in 2026/2027 matches.'],
    [
      'inactive',
      'Nobody is inactive',
      'Every student has been seen in the last 5 weeks.',
    ],
    ['left', 'Nobody has left', 'Students recorded as leaving appear here.'],
    [
      'graduated',
      'No graduates yet',
      'Graduate a final-year class from its class page, or start the school year.',
    ],
  ] as const)(
    'has an empty state for the %s tab',
    async (tab, title, description) => {
      setup({
        props: { search: { tab } },
        list: studentList([], { counts: counts({ active: 0 }) }),
      });
      expect(await screen.findByText(title)).toBeInTheDocument();
      expect(await screen.findByText(description)).toBeInTheDocument();
    }
  );

  it('shows the New intakes callout with the school year', async () => {
    setup({ props: { search: { tab: 'new' } } });
    expect(
      await screen.findByText(
        /Students admitted in 2026\/2027\. They are Active students/
      )
    ).toBeInTheDocument();
  });

  it('shows the pager only above ten rows', async () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      studentRow({
        id: KID_ID(index),
        firstName: `Kid${index}`,
        admissionNumber: `GF-${index}`,
      })
    );
    setup({ list: studentList(many, { total: 23 }) });
    expect(
      await screen.findByText('Showing 1 to 10 of 23')
    ).toBeInTheDocument();
  });

  it('has no pager for ten rows or fewer', async () => {
    setup();
    await screen.findByText('Ada Okeke', { exact: false });
    expect(screen.queryByText(/Showing 1 to/)).not.toBeInTheDocument();
  });

  it('shows a loading state', async () => {
    const { students } = setup();
    students.list.mockReturnValue(new Promise(() => undefined));
    expect(await screen.findAllByRole('status')).not.toHaveLength(0);
  });

  it('opens a student from the row', async () => {
    const { onOpenStudent } = setup();
    fireEvent.click(await screen.findByText('Ada Okeke', { exact: false }));
    expect(onOpenStudent).toHaveBeenCalledWith(STUDENT_ID);
  });
});

const headers = () =>
  screen.getAllByRole('columnheader').map((header) => header.textContent);

describe('StudentsPage columns per tab', () => {
  it('shows Admitted on New intakes', async () => {
    setup({ props: { search: { tab: 'new' } } });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(headers()).toContain('Admitted');
    expect(screen.getAllByText('8 Sep 2025')).toHaveLength(2);
  });

  it('shows Not seen since, Weeks away and the due badge on Inactive', async () => {
    setup({
      props: { search: { tab: 'inactive' } },
      list: studentList([
        studentRow({
          life: 'inactive',
          dueLeft: true,
          notSeenSince: '2026-05-22',
          notSeenBy: { id: 'u1', name: 'Tunde Bakare' },
          weeksAway: 20,
        }),
      ]),
    });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(headers()).toEqual(
      expect.arrayContaining(['Not seen since', 'Weeks away'])
    );
    expect(screen.getByText('Marked by Tunde Bakare')).toBeInTheDocument();
    expect(screen.getByText('Due to be marked Left')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });

  it('shows Left on, the reason and its note on Left', async () => {
    setup({
      props: { search: { tab: 'left' } },
      list: studentList([
        studentRow({
          life: 'left',
          exit: {
            kind: 'left',
            on: '2026-09-25',
            reason: 'Relocated',
            note: 'Moved to Abuja',
            recordedOn: '2026-09-28',
          },
        }),
      ]),
    });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(headers()).toEqual(
      expect.arrayContaining(['Last class', 'Left on', 'Reason'])
    );
    expect(screen.getByText('25 Sep 2026')).toBeInTheDocument();
    expect(screen.getByText('Relocated')).toBeInTheDocument();
    expect(screen.getByText('Moved to Abuja')).toBeInTheDocument();
  });

  it('shows the final class and school year on Graduated', async () => {
    setup({
      props: { search: { tab: 'graduated' } },
      list: studentList([
        studentRow({
          life: 'graduated',
          latestClassName: 'SS 3 Gold',
          graduatedSessionName: '2025/2026',
          exit: {
            kind: 'graduated',
            on: '2026-07-24',
            reason: 'Completed SS 3',
            note: null,
            recordedOn: '2026-07-24',
          },
        }),
      ]),
    });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(headers()).toEqual(
      expect.arrayContaining(['Final class', 'Graduated', 'School year'])
    );
    expect(screen.getByText('SS 3 Gold')).toBeInTheDocument();
    expect(screen.getByText('2025/2026')).toBeInTheDocument();
  });

  it('shows No class yet for an Active student with no placement and the Not seen badge for a marked one', async () => {
    setup({
      list: studentList([
        studentRow({ currentPlacement: null }),
        studentRow({
          id: ZAINAB_ID,
          firstName: 'Zainab',
          notSeenSince: '2026-10-01',
          weeksAway: 1,
        }),
      ]),
    });
    expect(await screen.findByText('No class yet')).toBeInTheDocument();
    expect(screen.getByText('Not seen 1 wk')).toBeInTheDocument();
  });
});

describe('StudentsPage scope notes', () => {
  it('names the campuses for a campus-scoped member', async () => {
    setup({
      access: fakeAccess({
        roles: ['bursar'],
        permissions: toPermissionMap(['student:read']),
        campusScope: [LEKKI.id],
      }),
      campuses: [LEKKI],
    });
    expect(
      await screen.findByText('Lekki campus · 2 shown')
    ).toBeInTheDocument();
  });

  it('names the classes for a class-scoped member', async () => {
    setup({
      access: fakeAccess({
        roles: ['teacher'],
        permissions: toPermissionMap(['student:read', 'class:read']),
        campusScope: [LEKKI.id],
        classScope: [ARM_ID],
      }),
      classes: [classSummary({ id: ARM_ID, displayName: 'JSS 2 Gold' })],
    });
    expect(
      await screen.findByText(
        'Students placed this term in JSS 2 Gold · 2 shown'
      )
    ).toBeInTheDocument();
  });

  it('does not leave a blank class name for a teacher with no class yet', async () => {
    setup({
      access: fakeAccess({
        roles: ['teacher'],
        permissions: toPermissionMap(['student:read', 'class:read']),
        campusScope: [LEKKI.id],
        classScope: [],
      }),
      classes: [],
    });
    expect(
      await screen.findByText('Students in your classes · 2 shown')
    ).toBeInTheDocument();
  });
});

describe('within a row', () => {
  it('keeps the name and number together in the first cell', async () => {
    setup();
    const row = (await screen.findByText('GF-0123')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('Ada Okeke')).toBeInTheDocument();
  });
});

describe('Start the school year', () => {
  const withStart = studentList([ada, ifeoma], {
    startYear: { targetYearId: YEAR_2027_ID, name: '2027/2028' },
  });

  it('shows Start {year} to a holder of enrollment:place while the action is offered', async () => {
    const { onSearchChange } = setup({ list: withStart });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Start 2027/2028' })
    );
    expect(onSearchChange).toHaveBeenCalledWith({ dialog: 'start-year' });
  });

  it('hides it when nothing is offered', async () => {
    setup();
    await screen.findByText('Ada Okeke', { exact: false });
    expect(
      screen.queryByRole('button', { name: /^Start 20/ })
    ).not.toBeInTheDocument();
  });

  it('hides it without enrollment:place', async () => {
    setup({ list: withStart, access: accessWith('student:read') });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(
      screen.queryByRole('button', { name: /^Start 20/ })
    ).not.toBeInTheDocument();
  });

  it('hides it for a read-only acting super admin', async () => {
    setup({ list: withStart, access: actingAccess(false) });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(
      screen.queryByRole('button', { name: /^Start 20/ })
    ).not.toBeInTheDocument();
  });

  it('opens the dialog from the start-year search param and reports closing it', async () => {
    const { onSearchChange } = setup({
      list: withStart,
      props: { search: { dialog: 'start-year' } },
    });
    expect(
      await screen.findByText(
        'Ticked students move up a level for 2027/2028.',
        {
          exact: false,
        }
      )
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onSearchChange).toHaveBeenCalledWith({
      dialog: undefined,
    });
  });

  it('does not open the dialog from the param without enrollment:place', async () => {
    setup({
      list: withStart,
      access: accessWith('student:read'),
      props: { search: { dialog: 'start-year' } },
    });
    await screen.findByText('Ada Okeke', { exact: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('Record leaving on the Inactive tab', () => {
  const due = studentRow({
    id: KUNLE_ID,
    firstName: 'Kunle',
    lastName: 'Ogun',
    admissionNumber: 'GF-0207',
    life: 'inactive',
    dueLeft: true,
    notSeenSince: '2026-05-22',
    weeksAway: 20,
  });
  const away = studentRow({
    id: UCHE_ID,
    firstName: 'Uche',
    lastName: 'Mba',
    admissionNumber: 'GF-0175',
    life: 'inactive',
    notSeenSince: '2026-07-10',
    weeksAway: 13,
  });
  const onInactive = { props: { search: { tab: 'inactive' as const } } };

  it('shows the button for a due student only, and opens the leaving dialog instead of the row', async () => {
    const { onRecordLeaving, onOpenStudent } = setup({
      ...onInactive,
      list: studentList([due, away]),
    });
    const button = await screen.findByRole('button', {
      name: 'Record leaving for Kunle Ogun',
    });
    expect(
      screen.queryByRole('button', { name: 'Record leaving for Uche Mba' })
    ).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(onRecordLeaving).toHaveBeenCalledWith(KUNLE_ID);
    expect(onOpenStudent).not.toHaveBeenCalled();
  });

  it('hides the button without student:archive', async () => {
    setup({
      ...onInactive,
      list: studentList([due]),
      access: accessWith('student:read', 'student:markAway'),
    });
    await screen.findByText('Kunle Ogun', { exact: false });
    expect(
      screen.queryByRole('button', { name: /Record leaving/ })
    ).not.toBeInTheDocument();
  });
});

describe('StudentsPage balance columns', () => {
  const owing = studentRow({
    id: BOLA_ID,
    firstName: 'Bola',
    lastName: 'Owing',
    balanceMinor: 500_000,
    chargedThisTermMinor: 1_800_000,
    paidThisTermMinor: 1_300_000,
  });
  const credit = studentRow({
    id: CHIDI_ID,
    firstName: 'Chidi',
    lastName: 'Credit',
    balanceMinor: -200_000,
    chargedThisTermMinor: null,
    paidThisTermMinor: null,
  });
  const clear = studentRow({
    id: DARA_ID,
    firstName: 'Dara',
    lastName: 'Clear',
    balanceMinor: 0,
    chargedThisTermMinor: 1_800_000,
    paidThisTermMinor: 1_800_000,
  });
  const finance = accessWith('student:read', 'invoice:read');
  const money = (...rows: ReturnType<typeof studentRow>[]) =>
    studentList(rows, { currency: 'NGN' });
  const openTab = async (
    tab: 'active' | 'new' | 'inactive' | 'left' | 'graduated',
    rows = [owing, credit, clear]
  ) => {
    setup({
      props: { search: { tab } },
      list: money(...rows),
      access: finance,
    });
    await screen.findByText('Bola Owing', { exact: false });
  };

  it('shows School fees on Active with owing, extra paid and Paid up', async () => {
    await openTab('active');
    expect(headers()).toContain('School fees');
    expect(screen.getByText('₦5,000')).toBeInTheDocument();
    expect(screen.getByText('₦2,000 extra paid')).toBeInTheDocument();
    expect(screen.getByText('Paid up')).toBeInTheDocument();
  });

  it('puts School fees before Status', async () => {
    await openTab('active');
    const order = headers();
    expect(order.indexOf('School fees')).toBeLessThan(order.indexOf('Status'));
  });

  it('shows Charged this term, Paid this term and Still owes on New intakes, with a dash for no current term', async () => {
    await openTab('new');
    expect(headers()).toEqual(
      expect.arrayContaining([
        'Charged this term',
        'Paid this term',
        'Still owes',
      ])
    );
    expect(screen.getAllByText('₦18,000')).toHaveLength(3);
    expect(screen.getByText('₦13,000')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('shows Owes before the Record leaving column on Inactive', async () => {
    await openTab('inactive');
    const order = headers();
    expect(order).toContain('Owes');
    expect(order.indexOf('Owes')).toBeGreaterThan(order.indexOf('Status'));
    expect(screen.getByText('₦5,000')).toBeInTheDocument();
  });

  it.each(['left', 'graduated'] as const)(
    'shows Still owes on the %s tab',
    async (tab) => {
      await openTab(tab);
      expect(headers()).toContain('Still owes');
      expect(screen.getByText('₦5,000')).toBeInTheDocument();
    }
  );

  it('shows a dash for a row without a balance', async () => {
    await openTab('active', [owing, studentRow({ id: BARE_ID })]);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.getAllByText('JSS 2 Gold', { selector: 'td' })).toHaveLength(
      2
    );
  });

  it.each(['active', 'new', 'inactive', 'left', 'graduated'] as const)(
    'has no balance column on the %s tab without finance read',
    async (tab) => {
      setup({
        props: { search: { tab } },
        list: money(owing),
        access: accessWith('student:read'),
      });
      await screen.findByText('Bola Owing', { exact: false });
      expect(headers()).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/fees|owes|term/i)])
      );
      expect(screen.queryByText('₦5,000')).not.toBeInTheDocument();
    }
  );

  it('has no balance column when the list carries no currency', async () => {
    setup({
      list: studentList([owing]),
      access: finance,
    });
    await screen.findByText('Bola Owing', { exact: false });
    expect(headers()).not.toContain('School fees');
  });
});
