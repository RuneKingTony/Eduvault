import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  ADA,
  CHIDI,
  FEE_LINE,
  FEE_LINE_LEKKI,
  FEE_LINE_RETIRED,
  JSS1,
  JSS3,
  TERM_1,
  TERM_2,
  TUITION,
  copySource,
  feeGrid,
  feeLine,
  feesApi,
  gridRow,
  preview,
  renderFees,
} from '../test-fees';
import { LEKKI, campus } from '../test-announcements';
import { ownerAccess, starterAccess } from '../test-utils';
import { OtherFeesPage } from './other-fees-page';
import { SchoolFeesPage } from './school-fees-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup(
  options: Parameters<typeof feesApi>[0] = {},
  access = ownerAccess(),
  search: { term?: string; add?: 1 } = {}
) {
  const api = feesApi(options);
  const onSearchChange = vi.fn();
  const view = renderFees(
    <SchoolFeesPage search={search} onSearchChange={onSearchChange} />,
    api,
    access
  );
  return { api, onSearchChange, view };
}

const lekkiOverride = feeLine({
  id: FEE_LINE_LEKKI,
  name: 'Tuition (Lekki)',
  campusId: LEKKI,
  campusName: 'Lekki',
  amountMinor: 17_000_000,
});

describe('SchoolFeesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the header, the term choices and the grid for the current term', async () => {
    const { api } = setup();
    const term = await screen.findByRole('combobox', { name: 'Term' });
    expect(
      (await within(term).findAllByRole('option')).map((o) => o.textContent)
    ).toEqual(['First term, 2026/2027', 'Second term, 2026/2027']);
    expect(term).toHaveValue(TERM_1);
    expect(
      await screen.findByText('School fees · First term, 2026/2027')
    ).toBeInTheDocument();
    expect(api.feeLines.grid).toHaveBeenCalledWith({
      query: { termId: TERM_1, group: 'school', feeTypeId: undefined },
    });
    expect(screen.getByText('1 fee across 1 level.')).toBeInTheDocument();
  });

  it('asks for the next term from the select and keeps the current choice from the search', async () => {
    const { onSearchChange, api } = setup({}, ownerAccess(), { term: TERM_2 });
    const term = await screen.findByRole('combobox', { name: 'Term' });
    await waitFor(() => {
      expect(term).toHaveValue(TERM_2);
    });
    await waitFor(() => {
      expect(api.feeLines.list).toHaveBeenCalledWith({
        query: { termId: TERM_2, group: 'school' },
      });
    });
    fireEvent.change(term, { target: { value: TERM_1 } });
    expect(onSearchChange).toHaveBeenCalledWith({ term: TERM_1 });
  });

  it('links School fees and Other fees', async () => {
    setup();
    const tabs = await screen.findByRole('navigation', { name: 'Fees' });
    expect(
      within(tabs).getByRole('link', { name: 'School fees' })
    ).toBeInTheDocument();
    expect(
      within(tabs).getByRole('link', { name: 'Other fees' })
    ).toBeInTheDocument();
  });

  it('lists every line in All fees with campus, applies-to, amount and status', async () => {
    setup({
      lines: [
        feeLine(),
        lekkiOverride,
        feeLine({
          id: FEE_LINE_RETIRED,
          name: 'Old tuition',
          retiredAt: '2026-10-05T09:00:00.000Z',
          appliesTo: 'new',
          isOptional: true,
        }),
      ],
    });
    const row = await screen.findByRole('row', { name: /Tuition \(Lekki\)/ });
    expect(within(row).getByText('Lekki')).toBeInTheDocument();
    expect(within(row).getByText('₦170,000')).toBeInTheDocument();
    expect(within(row).getByText('Active')).toBeInTheDocument();
    const retired = screen.getByRole('row', { name: /Old tuition/ });
    expect(within(retired).getByText('Retired')).toBeInTheDocument();
    expect(within(retired).getByText('New students only')).toBeInTheDocument();
    expect(within(retired).getByText('Optional')).toBeInTheDocument();
    expect(
      within(retired).queryByRole('button', { name: /Edit amount/ })
    ).not.toBeInTheDocument();
    expect(
      within(retired).queryByRole('button', { name: /Retire line/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText('All fees')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows the empty states with no school fees', async () => {
    setup({ lines: [], grid: feeGrid({ rows: [] }) });
    expect(
      await screen.findAllByText('No school fees for this term')
    ).toHaveLength(2);
  });

  it('changes an amount and toasts the new figure', async () => {
    const { api } = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit amount of Tuition' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Change Tuition')).toBeInTheDocument();
    expect(
      within(dialog).getByText('JSS 2 · First term, 2026/2027')
    ).toBeInTheDocument();
    const amount = within(dialog).getByLabelText('Amount (₦)');
    expect(amount).toHaveValue('180,000');
    fireEvent.change(amount, { target: { value: '₦250,000' } });
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save amount' })
    );
    await waitFor(() => {
      expect(api.feeLines.update).toHaveBeenCalledWith({
        params: { id: FEE_LINE },
        body: { amountMinor: 25_000_000 },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Tuition is now ₦250,000. Charges already sent keep the old amount.'
      );
    });
  });

  it('answers Enter an amount for a zero or unreadable amount and sends nothing', async () => {
    const { api } = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit amount of Tuition' })
    );
    const dialog = await screen.findByRole('dialog');
    for (const value of ['0', 'abc', '']) {
      fireEvent.change(within(dialog).getByLabelText('Amount (₦)'), {
        target: { value },
      });
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Save amount' })
      );
      expect(
        await within(dialog).findByText('Enter an amount.')
      ).toBeInTheDocument();
    }
    expect(api.feeLines.update).not.toHaveBeenCalled();
  });

  it('retires a line after confirming and toasts that it is kept', async () => {
    const { api } = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Retire line Tuition' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Retire Tuition?')).toBeInTheDocument();
    expect(within(dialog).getByText('JSS 2 · ₦180,000')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Charges already sent don’t change/)
    ).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Retire line' })
    );
    await waitFor(() => {
      expect(api.feeLines.retire).toHaveBeenCalledWith({
        params: { id: FEE_LINE },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Tuition retired. It is kept for history.'
      );
    });
  });

  it('toasts a refusal from the server instead of closing', async () => {
    const { api } = setup();
    api.feeLines.update.mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message: "This term has ended. Fees for it can't change.",
      })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit amount of Tuition' })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save amount' })
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "This term has ended. Fees for it can't change."
      );
    });
  });

  it('adds a fee from the sheet with the amount read in naira and every campus as null', async () => {
    const { api, onSearchChange } = setup({}, ownerAccess(), { add: 1 });
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('New school fee')).toBeInTheDocument();
    expect(
      await within(sheet).findByText(
        'For First term, 2026/2027. It applies from the next round of charges.'
      )
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Fee type')).toHaveValue(TUITION.id);
    expect(within(sheet).getByLabelText('Campus')).toHaveValue('every-campus');
    fireEvent.change(within(sheet).getByLabelText('Name'), {
      target: { value: 'Excursion' },
    });
    fireEvent.change(within(sheet).getByLabelText('Amount (₦)'), {
      target: { value: '₦15,000' },
    });
    fireEvent.click(
      within(sheet).getByRole('checkbox', { name: /Optional fee/ })
    );
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add a fee' }));
    await waitFor(() => {
      expect(api.feeLines.create).toHaveBeenCalledWith({
        body: {
          termId: TERM_1,
          classLevelId: JSS1,
          feeTypeId: TUITION.id,
          campusId: null,
          name: 'Excursion',
          amountMinor: 1_500_000,
          appliesTo: 'all',
          isOptional: true,
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Added Excursion. It applies from the next round of charges.'
      );
    });
    expect(onSearchChange).toHaveBeenCalledWith({ add: undefined });
  });

  it('asks for an amount when it is unreadable and sends nothing', async () => {
    const { api } = setup({}, ownerAccess(), { add: 1 });
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByLabelText('Fee type');
    fireEvent.change(within(sheet).getByLabelText('Name'), {
      target: { value: 'Excursion' },
    });
    fireEvent.change(within(sheet).getByLabelText('Amount (₦)'), {
      target: { value: 'abc' },
    });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Add a fee' }));
    expect(
      await within(sheet).findByText('Enter an amount.')
    ).toBeInTheDocument();
    expect(api.feeLines.create).not.toHaveBeenCalled();
  });

  it('opens the add sheet from the Add a fee button', async () => {
    const { onSearchChange } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add a fee' }));
    expect(onSearchChange).toHaveBeenCalledWith({ add: 1 });
  });

  it('offers no Every campus option without campus:readAll', async () => {
    const bursar = starterAccess('bursar');
    setup(
      {
        lines: [feeLine(), lekkiOverride],
        campuses: [campus(LEKKI, 'Lekki')],
      },
      bursar,
      { add: 1 }
    );
    const sheet = await screen.findByRole('dialog');
    const campusField = await within(sheet).findByLabelText('Campus');
    expect(
      within(campusField)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Lekki']);
    expect(campusField).toHaveValue(LEKKI);
  });

  it('hides write controls from an administrator, who only reads', async () => {
    setup(
      { lines: [feeLine(), lekkiOverride] },
      starterAccess('administrator')
    );
    await screen.findByRole('row', { name: /Tuition \(Lekki\)/ });
    expect(
      screen.queryByRole('button', { name: 'Add a fee' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Edit amount/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Retire line/ })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Term' })).toBeInTheDocument();
  });

  it('shows a campus bursar the actions of a campus line but not of an every-campus line', async () => {
    setup({ lines: [feeLine(), lekkiOverride] }, starterAccess('bursar'));
    await screen.findByRole('row', { name: /Tuition \(Lekki\)/ });
    expect(
      screen.getByRole('button', { name: 'Edit amount of Tuition (Lekki)' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit amount of Tuition' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retire line Tuition' })
    ).not.toBeInTheDocument();
  });

  it('shows a loading state, then an error when a query fails', async () => {
    const api = feesApi();
    api.feeLines.grid.mockRejectedValue(
      new ApiError(500, {
        code: 'UnknownError',
        message: 'Fees are unavailable',
      })
    );
    renderFees(<SchoolFeesPage search={{}} onSearchChange={vi.fn()} />, api);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fees are unavailable'
    );
  });

  it('shows the no-school-year callout without a current term', async () => {
    const api = feesApi();
    api.feeLines.setup.mockResolvedValue({ terms: [], levels: [] });
    renderFees(<SchoolFeesPage search={{}} onSearchChange={vi.fn()} />, api);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Create the first school year'
    );
  });
});

describe('the Copy from last term button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows for an owner when the term is empty and an earlier term has fees', async () => {
    const { api } = setup();
    expect(
      await screen.findByRole('button', { name: 'Copy from last term' })
    ).toBeInTheDocument();
    expect(api.feeLines.copySource).toHaveBeenCalledWith({
      query: { termId: TERM_1 },
    });
  });

  it('opens the confirm dialog and copies into the chosen term', async () => {
    const { api } = setup();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Copy from last term' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Copy fees from Third term, 2025/2026?')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Into First term, 2026/2027.')
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy fees' }));
    await waitFor(() => {
      expect(api.feeLines.copy).toHaveBeenCalledWith({
        body: { termId: TERM_1 },
      });
    });
  });

  it('is hidden when the term already has fees', async () => {
    setup({ copySource: copySource({ targetHasLines: true }) });
    await screen.findByRole('button', { name: 'Add a fee' });
    expect(
      screen.queryByRole('button', { name: 'Copy from last term' })
    ).not.toBeInTheDocument();
  });

  it('is hidden when there is no earlier term or it has no fees', async () => {
    const none = setup({
      copySource: copySource({ sourceTerm: null, liveLineCount: 0 }),
    });
    await screen.findByRole('button', { name: 'Add a fee' });
    await waitFor(() => {
      expect(none.api.feeLines.copySource).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole('button', { name: 'Copy from last term' })
    ).not.toBeInTheDocument();
  });

  it('is hidden from a member without campus:readAll and sends no copy-source request', async () => {
    const { api } = setup({}, starterAccess('bursar'));
    await screen.findByRole('button', { name: 'Add a fee' });
    expect(
      screen.queryByRole('button', { name: 'Copy from last term' })
    ).not.toBeInTheDocument();
    expect(api.feeLines.copySource).not.toHaveBeenCalled();
  });

  it('is hidden from a member who cannot create fees', async () => {
    const { api } = setup({}, starterAccess('administrator'));
    await screen.findByRole('combobox', { name: 'Term' });
    expect(
      screen.queryByRole('button', { name: 'Copy from last term' })
    ).not.toBeInTheDocument();
    expect(api.feeLines.copySource).not.toHaveBeenCalled();
  });

  it('is not offered on Other fees', async () => {
    const api = feesApi();
    renderFees(
      <OtherFeesPage search={{}} onSearchChange={vi.fn()} />,
      api,
      ownerAccess()
    );
    await screen.findByRole('button', { name: 'Add a fee' });
    expect(
      screen.queryByRole('button', { name: 'Copy from last term' })
    ).not.toBeInTheDocument();
    expect(api.feeLines.copySource).not.toHaveBeenCalled();
  });
});

describe('the preview card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previews the first student with badges, lines and the total', async () => {
    const { api } = setup();
    expect(
      await screen.findByText('Preview for one student')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Exactly what the next round of charges would be.')
    ).toBeInTheDocument();
    const picker = await screen.findByRole('combobox', {
      name: 'Preview student',
    });
    expect(
      within(picker)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['Ada Okeke · GF-0123', 'Chidi Eze · GF-0124']);
    await waitFor(() => {
      expect(api.feeLines.preview).toHaveBeenCalledWith({
        query: { termId: TERM_1, studentId: ADA },
      });
    });
    expect(await screen.findByText('JSS 2 Gold')).toBeInTheDocument();
    expect(screen.getByText('Returning student')).toBeInTheDocument();
    expect(screen.getByText('Not billed yet')).toBeInTheDocument();
    expect(screen.getByText('Opted in')).toBeInTheDocument();
    expect(screen.getByText('₦225,000')).toBeInTheDocument();
  });

  it('previews another student from the picker', async () => {
    const { api } = setup();
    const picker = await screen.findByRole('combobox', {
      name: 'Preview student',
    });
    fireEvent.change(picker, { target: { value: CHIDI } });
    await waitFor(() => {
      expect(api.feeLines.preview).toHaveBeenCalledWith({
        query: { termId: TERM_1, studentId: CHIDI },
      });
    });
  });

  it('searches the candidates and says how many match', async () => {
    const { api } = setup();
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Search students' }),
      {
        target: { value: 'chidi' },
      }
    );
    await waitFor(() => {
      expect(api.feeLines.candidates).toHaveBeenCalledWith({
        query: { termId: TERM_1, q: 'chidi' },
      });
    });
    expect(
      await screen.findByText('2 of 2 students match')
    ).toBeInTheDocument();
  });

  it('says so when nothing matches and hides the picker', async () => {
    const { api } = setup();
    await screen.findByRole('combobox', { name: 'Preview student' });
    api.feeLines.candidates.mockResolvedValue({ items: [], total: 0 });
    fireEvent.change(screen.getByRole('textbox', { name: 'Search students' }), {
      target: { value: 'zzz' },
    });
    expect(
      await screen.findByText('No student matches that search')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Preview student' })
    ).not.toBeInTheDocument();
  });

  it('shows the no-students state', async () => {
    const api = feesApi();
    api.feeLines.candidates.mockResolvedValue({ items: [], total: 0 });
    renderFees(<SchoolFeesPage search={{}} onSearchChange={vi.fn()} />, api);
    expect(
      await screen.findByText('No students in your scope')
    ).toBeInTheDocument();
  });

  it('shows an approved discount line in the preview as a negative amount', async () => {
    setup({
      preview: preview({
        lines: [
          preview().lines[0]!,
          {
            feeLineId: null,
            description: 'Sibling discount (3 children) (5% of tuition)',
            feeTypeName: 'Discounts given',
            amountMinor: -900_000,
            optedIn: false,
            campusName: null,
          },
        ],
        totalMinor: 17_100_000,
      }),
    });
    const row = await screen.findByRole('row', {
      name: /Sibling discount \(3 children\)/,
    });
    expect(row).toHaveTextContent('−₦9,000');
  });

  it('shows an already-charged badge and a pending-discount callout', async () => {
    setup({
      preview: preview({
        charged: { status: 'sent', number: 'CHG-0001' },
        pendingDiscounts: ['Academic scholarship', 'Staff child'],
      }),
    });
    expect(await screen.findByText('Already charged')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Pending discount not applied yet: Academic scholarship, Staff child\. It applies once a boss approves it\./
      )
    ).toBeInTheDocument();
  });

  it('says no fee lines apply for a student with none', async () => {
    setup({ preview: preview({ lines: [], totalMinor: 0 }) });
    expect(await screen.findByText('No fee lines apply')).toBeInTheDocument();
  });

  it('leaves the preview out for a member who cannot read students', async () => {
    const access = ownerAccess();
    setup(
      {},
      {
        ...access,
        permissions: { feeLine: ['read'] },
      }
    );
    await screen.findByText('School fees · First term, 2026/2027');
    expect(
      screen.queryByText('Preview for one student')
    ).not.toBeInTheDocument();
  });
});

describe('the grid rows', () => {
  it('lists only the levels the grid answers', async () => {
    setup({
      grid: feeGrid({
        rows: [
          gridRow(),
          gridRow({
            level: { id: JSS3, name: 'JSS 3', sequence: 9 },
            typicalTotalMinor: 21_000_000,
          }),
        ],
      }),
    });
    expect(
      await screen.findByRole('row', { name: /JSS 3/ })
    ).toBeInTheDocument();
    expect(screen.getByText('2 fees across 2 levels.')).toBeInTheDocument();
  });
});
