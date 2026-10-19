import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import {
  TERM_ONE,
  RUN_TWO_ID,
  TERM_TWO,
  billingApi,
  billingTerm,
  prepareResult,
  renderBilling,
  runSummary,
} from '../test-billing';
import { JSS1, JSS2 } from '../test-fees';
import { fakeAccess, ownerAccess, starterAccess } from '../test-utils';
import { BillingPage } from './billing-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function setup(
  api = billingApi(),
  access = ownerAccess(),
  search: { page?: number; prepare?: 1 } = {}
) {
  const onSearchChange = vi.fn();
  renderBilling(
    <BillingPage search={search} onSearchChange={onSearchChange} />,
    api,
    { access }
  );
  return { api, onSearchChange };
}

describe('BillingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists earlier rounds with their number, term, scope, total and status', async () => {
    setup(
      billingApi({
        runs: [
          runSummary(),
          runSummary({
            id: RUN_TWO_ID,
            number: 'BR-2026-0002',
            termName: 'Second term, 2026/2027',
            scopeLabel: 'Campus: Lekki',
            status: 'draft',
            issuedAt: null,
            chargeCount: 1,
            totalMinor: 22_600_000,
          }),
        ],
      })
    );
    const row = (await screen.findByText('BR-2026-0002')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(
      cells.getByText('Second term, 2026/2027 · Campus: Lekki')
    ).toBeVisible();
    expect(cells.getByText('1 charge')).toBeVisible();
    expect(cells.getByText('Prepared')).toBeVisible();
    expect(cells.getByText('—')).toBeVisible();
    expect(screen.getAllByText('Sent')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /BR-2026-0001/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/finance/billing/')
    );
  });

  it('shows the empty state with a Charge students button', async () => {
    setup(billingApi({ runs: [] }));
    expect(await screen.findByText('No charges sent yet')).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: 'Charge students' })
    ).toHaveLength(2);
  });

  it('hides Charge students from a reader and leaves the list', async () => {
    setup(billingApi(), starterAccess('administrator'));
    expect(await screen.findByText('BR-2026-0001')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Charge students' })
    ).not.toBeInTheDocument();
  });

  it('hides it for a read-only acting super admin too', async () => {
    setup(
      billingApi({ runs: [] }),
      fakeAccess({ permissions: { invoice: ['read'] }, campusScope: 'all' })
    );
    expect(await screen.findByText('No charges sent yet')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Charge students' })
    ).not.toBeInTheDocument();
  });

  it('opens the sheet when the search says prepare', async () => {
    setup(billingApi(), ownerAccess(), { prepare: 1 });
    expect(
      await screen.findByRole('dialog', { name: 'Charge students' })
    ).toBeVisible();
  });

  it('asks the page to set the prepare flag when the button is pressed', async () => {
    const { onSearchChange } = setup();
    await screen.findByText('BR-2026-0001');
    fireEvent.click(screen.getByRole('button', { name: 'Charge students' }));
    expect(onSearchChange).toHaveBeenCalledWith({ prepare: 1 });
  });
});

describe('the prepare sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks charged terms and defaults to the term the API marks', async () => {
    setup(
      billingApi({
        terms: [
          billingTerm({ charged: 'all' }),
          billingTerm({
            termId: TERM_TWO,
            name: 'Second term',
            charged: 'partly',
            isDefault: true,
          }),
        ],
      }),
      ownerAccess(),
      { prepare: 1 }
    );
    const sheet = await screen.findByRole('dialog', {
      name: 'Charge students',
    });
    const term = await within(sheet).findByLabelText('Term');
    expect(
      within(term)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'First term, 2026/2027 (already charged)',
      'Second term, 2026/2027 (partly charged)',
    ]);
    expect(term).toHaveValue(TERM_TWO);
  });

  it('shows the campus or level picker only for those choices', async () => {
    setup(billingApi(), ownerAccess(), { prepare: 1 });
    const sheet = await screen.findByRole('dialog', {
      name: 'Charge students',
    });
    const who = await within(sheet).findByLabelText('Who to charge');
    expect(within(sheet).queryByLabelText('Campus')).not.toBeInTheDocument();
    fireEvent.change(who, { target: { value: 'campus' } });
    expect(within(sheet).getByLabelText('Campus')).toBeVisible();
    expect(within(sheet).queryByLabelText('Level')).not.toBeInTheDocument();
    fireEvent.change(who, { target: { value: 'level' } });
    expect(within(sheet).getByLabelText('Level')).toBeVisible();
    expect(within(sheet).queryByLabelText('Campus')).not.toBeInTheDocument();
  });

  it('lists only the levels with an enrolment in the chosen term’s year', async () => {
    setup(
      billingApi({
        terms: [
          billingTerm({ levelIds: [JSS1] }),
          billingTerm({
            termId: TERM_TWO,
            name: 'Second term',
            charged: 'none',
            isDefault: true,
            levelIds: [JSS1, JSS2],
          }),
        ],
      }),
      ownerAccess(),
      { prepare: 1 }
    );
    const sheet = await screen.findByRole('dialog', {
      name: 'Charge students',
    });
    const who = await within(sheet).findByLabelText('Who to charge');
    fireEvent.change(who, { target: { value: 'level' } });
    const levelNames = () =>
      within(within(sheet).getByLabelText('Level'))
        .getAllByRole('option')
        .map((option) => option.textContent);
    expect(levelNames()).toEqual(['JSS 1', 'JSS 2']);
    fireEvent.change(within(sheet).getByLabelText('Term'), {
      target: { value: TERM_ONE },
    });
    expect(levelNames()).toEqual(['JSS 1']);
  });

  it('prepares the whole school and shows the ready callout with a toast', async () => {
    const { api } = setup(billingApi(), ownerAccess(), { prepare: 1 });
    const sheet = await screen.findByRole('dialog', {
      name: 'Charge students',
    });
    await within(sheet).findByLabelText('Term');
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Prepare charges' })
    );
    await waitFor(() => {
      expect(api.billingRuns.prepare).toHaveBeenCalledWith({
        body: { termId: TERM_TWO, scope: 'school', scopeId: undefined },
      });
    });
    expect(await screen.findByText('3 charges ready to check')).toBeVisible();
    expect(
      screen.getByText(
        /1 already charged for Second term, 2026\/2027 were skipped/
      )
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: /Check and send/, hidden: true })
    ).toHaveAttribute('href', expect.stringContaining('/finance/billing/'));
    expect(toast.success).toHaveBeenCalledWith(
      '3 charges ready to check.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Check them' }),
      })
    );
  });

  it('adds the students with no fees to the ready callout', async () => {
    const api = billingApi();
    api.billingRuns.prepare.mockResolvedValue(
      prepareResult({ created: 1, skipped: 0, none: 2 })
    );
    setup(api, ownerAccess(), { prepare: 1 });
    const sheet = await screen.findByRole('dialog', {
      name: 'Charge students',
    });
    await within(sheet).findByLabelText('Term');
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Prepare charges' })
    );
    expect(await screen.findByText(/2 had no fees that apply/)).toBeVisible();
    expect(screen.getByText('1 charge ready to check')).toBeVisible();
  });

  it('says nothing new when nobody was charged, and warns with a toast', async () => {
    const api = billingApi();
    api.billingRuns.prepare.mockResolvedValue(
      prepareResult({ runId: null, number: null, created: 0, skipped: 4 })
    );
    setup(api, ownerAccess(), { prepare: 1 });
    const sheet = await screen.findByRole('dialog', {
      name: 'Charge students',
    });
    await within(sheet).findByLabelText('Term');
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Prepare charges' })
    );
    expect(
      await screen.findByText('Nothing new: 4 already charged.')
    ).toBeVisible();
    expect(
      screen.getByText(
        'Every student you can see already has a Second term, 2026/2027 charge. Trying again never charges twice.'
      )
    ).toBeVisible();
    expect(toast.warning).toHaveBeenCalledWith(
      '0 new, 4 already charged. Nobody was charged twice.'
    );
  });

  it('sends the chosen campus with a campus prepare', async () => {
    const { api } = setup(billingApi(), ownerAccess(), { prepare: 1 });
    const sheet = await screen.findByRole('dialog', {
      name: 'Charge students',
    });
    const who = await within(sheet).findByLabelText('Who to charge');
    fireEvent.change(who, { target: { value: 'campus' } });
    const campus = within(sheet).getByLabelText('Campus');
    fireEvent.change(campus, {
      target: { value: (campus as HTMLSelectElement).options[1]?.value },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Prepare charges' })
    );
    await waitFor(() => {
      expect(api.billingRuns.prepare).toHaveBeenCalledWith({
        body: {
          termId: TERM_TWO,
          scope: 'campus',
          scopeId: (campus as HTMLSelectElement).options[1]?.value,
        },
      });
    });
  });

  it('toasts the API’s refusal and keeps the sheet', async () => {
    const api = billingApi();
    api.billingRuns.prepare.mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message: 'Choose the current term or the next term.',
      })
    );
    setup(api, ownerAccess(), { prepare: 1 });
    const sheet = await screen.findByRole('dialog', {
      name: 'Charge students',
    });
    await within(sheet).findByLabelText('Term');
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Prepare charges' })
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Choose the current term or the next term.'
      );
    });
    expect(
      screen.getByRole('dialog', { name: 'Charge students' })
    ).toBeVisible();
  });

  it('is not offered the first term as default when it is charged', async () => {
    setup(billingApi(), ownerAccess(), { prepare: 1 });
    const sheet = await screen.findByRole('dialog', {
      name: 'Charge students',
    });
    expect(await within(sheet).findByLabelText('Term')).not.toHaveValue(
      TERM_ONE
    );
  });
});
