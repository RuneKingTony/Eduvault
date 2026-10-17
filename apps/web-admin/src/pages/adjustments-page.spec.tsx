import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import type { AdjustmentsSearch } from '../adjustments-search';
import {
  BOLA,
  DISCOUNT_ID,
  adjustmentList,
  adjustmentRow,
  discountList,
  discountRow,
  voidList,
} from '../test-approvals';
import { currentYear, nextYear, schoolYear, term } from '../test-calendar';
import { renderPayments } from '../test-payments';
import { settings } from '../test-school';
import { studentDetail, studentList, studentRow } from '../test-students';
import { starterAccess } from '../test-utils';
import { AdjustmentsPage } from './adjustments-page';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const termChoices = (years: ReturnType<typeof schoolYear>[]) =>
  years.flatMap((year) =>
    year.terms.map((entry) => ({
      id: entry.id,
      label: `${entry.name}, ${year.name}`,
      startsOn: entry.startsOn,
      isCurrent: entry.isCurrent,
    }))
  );

const ADA = studentRow().id;
const BOLA_ROW = studentRow({
  id: BOLA,
  firstName: 'Bola',
  lastName: 'Johnson',
  admissionNumber: 'GF-0087',
});
const ACCOUNT = '00000000-0000-4000-8000-0000000f0001';
const TUITION = '00000000-0000-4000-8000-000000000721';

function setup(
  options: {
    search?: AdjustmentsSearch;
    access?: ReturnType<typeof starterAccess>;
    corrections?: ReturnType<typeof adjustmentList>;
    voids?: ReturnType<typeof voidList>;
    discounts?: ReturnType<typeof discountList>;
    createFails?: Error;
    rules?: Partial<ReturnType<typeof settings>['approvalRules']>;
    autoApproved?: boolean;
    students?: ReturnType<typeof studentRow>[];
    years?: ReturnType<typeof schoolYear>[];
  } = {}
) {
  const base = settings();
  const api = {
    adjustments: {
      list: vi.fn().mockResolvedValue(options.corrections ?? adjustmentList()),
      create: vi.fn().mockImplementation(() =>
        options.createFails === undefined
          ? Promise.resolve({
              adjustment: adjustmentRow(),
              autoApproved: options.autoApproved === true,
            })
          : Promise.reject(options.createFails)
      ),
    },
    paymentVoids: {
      list: vi.fn().mockResolvedValue(options.voids ?? voidList()),
    },
    studentDiscounts: {
      terms: vi
        .fn()
        .mockResolvedValue(
          termChoices(options.years ?? [currentYear(), nextYear()])
        ),
      list: vi.fn().mockResolvedValue(options.discounts ?? discountList()),
      create: vi.fn().mockResolvedValue({
        discount: discountRow(),
        autoApproved: options.autoApproved === true,
      }),
      end: vi.fn().mockResolvedValue(
        discountRow({
          status: 'approved',
          endedAt: '2026-10-20T09:00:00.000Z',
        })
      ),
    },
    students: {
      list: vi
        .fn()
        .mockImplementation(({ query }: { query: { q?: string } }) =>
          Promise.resolve(
            studentList(
              (options.students ?? [studentRow(), BOLA_ROW]).filter((row) =>
                `${row.firstName} ${row.lastName} ${row.admissionNumber}`
                  .toLowerCase()
                  .includes((query.q ?? '').toLowerCase())
              )
            )
          )
        ),
      get: vi.fn().mockResolvedValue(studentDetail()),
    },
    moneyAccounts: {
      forRecording: vi
        .fn()
        .mockResolvedValue([
          { id: ACCOUNT, label: 'GTBank current · ending 4417' },
        ]),
    },
    ledgerAccounts: {
      list: vi.fn().mockResolvedValue({
        currency: 'NGN',
        scoped: false,
        items: [
          {
            id: 'la-5000',
            code: 5000,
            name: 'Discounts given',
            type: 'expense',
            parentId: null,
            systemKey: 'discounts_given',
            balanceMinor: 0,
          },
          {
            id: TUITION,
            code: 4010,
            name: 'Tuition',
            type: 'income',
            parentId: 'fee',
            systemKey: null,
            balanceMinor: 0,
          },
        ],
      }),
    },
    invoices: {
      list: vi.fn().mockResolvedValue({
        currency: 'NGN',
        items: [
          {
            id: 'inv-1',
            number: 'CHG-2026-00012',
            kind: 'term',
            termName: 'First term',
            forText: 'Tuition',
            totalMinor: 22_000_000,
          },
          {
            id: 'inv-2',
            number: 'CHG-2026-00031',
            kind: 'adhoc',
            termName: 'First term',
            forText: 'Excursion',
            totalMinor: 1_500_000,
          },
        ],
        total: 2,
      }),
    },
    feeTypes: {
      list: vi.fn().mockResolvedValue([
        { id: 'pta', code: 4020, name: 'PTA fee' },
        { id: TUITION, code: 4010, name: 'Tuition' },
      ]),
    },
    schoolSettings: {
      get: vi.fn().mockResolvedValue({
        ...base,
        approvalRules: { ...base.approvalRules, ...options.rules },
      }),
    },
  };
  const onSearchChange = vi.fn();
  renderPayments(
    <AdjustmentsPage
      search={options.search ?? {}}
      onSearchChange={onSearchChange}
    />,
    api,
    {
      access: options.access ?? starterAccess('bursar'),
      path: '/finance/adjustments',
    }
  );
  return { api, onSearchChange };
}

describe('AdjustmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('titles the page and carries the waiting count on each tab that has some', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: 'Discounts and refunds' })
    ).toBeVisible();
    expect(
      screen.getByText(
        'Refunds, discounts and corrections. One person asks, a boss approves.'
      )
    ).toBeVisible();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Refunds and corrections1',
      'Cancelled payments1',
      'Discounts1',
    ]);
  });

  it('shows no count on a tab with nothing waiting', async () => {
    setup({
      corrections: adjustmentList([
        adjustmentRow({ status: 'approved', approvedBy: 'Grace Nwosu' }),
      ]),
      voids: voidList([]),
      discounts: discountList([]),
    });
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Refunds and corrections',
      'Cancelled payments',
      'Discounts',
    ]);
  });

  it('lists corrections with student, kind, reason, amount, who asked and a link to Approvals while waiting', async () => {
    setup();
    const row = (await screen.findByText('Bola Johnson')).closest(
      'tr'
    ) as HTMLElement;
    expect(within(row).getByText('GF-0087')).toBeVisible();
    expect(within(row).getByText('Cancel a balance')).toBeVisible();
    expect(within(row).getByText('Family moved to Abuja')).toBeVisible();
    expect(within(row).getByText('₦12,000')).toBeVisible();
    expect(within(row).getByText('Chika Eze')).toBeVisible();
    expect(within(row).getByText('Waiting')).toBeVisible();
    expect(
      within(row).getByRole('link', { name: 'See in Approvals' })
    ).toHaveAttribute('href', '/approvals');
  });

  it('quotes a decline under the reason and says Declined, with no link', async () => {
    setup({
      corrections: adjustmentList([
        adjustmentRow({
          status: 'rejected',
          rejectionReason: 'Not agreed with the owner',
        }),
      ]),
    });
    const row = (await screen.findByText('Bola Johnson')).closest(
      'tr'
    ) as HTMLElement;
    expect(
      within(row).getByText('Declined: Not agreed with the owner')
    ).toBeVisible();
    expect(within(row).getByText('Declined')).toBeVisible();
    expect(
      within(row).queryByRole('link', { name: 'See in Approvals' })
    ).toBeNull();
  });

  it('says No adjustments when there are none', async () => {
    setup({ corrections: adjustmentList([]) });
    expect(await screen.findByText('No adjustments')).toBeVisible();
  });

  it('lists the cancelled payments with a link to the receipt', async () => {
    setup({ search: { tab: 'voids' } });
    const link = await screen.findByRole('link', { name: 'RCT-2026-00098' });
    const row = link.closest('tr') as HTMLElement;
    expect(within(row).getByText('Mrs Danjuma')).toBeVisible();
    expect(within(row).getByText('₦20,000')).toBeVisible();
    expect(within(row).getByText('Keyed the wrong child')).toBeVisible();
    expect(
      within(row).getByRole('link', { name: 'See in Approvals' })
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /^New/ })).toBeNull();
  });

  it('says No voids requested when there are none', async () => {
    setup({ search: { tab: 'voids' }, voids: voidList([]) });
    expect(await screen.findByText('No voids requested')).toBeVisible();
  });

  it('lists discounts with what they take off, their terms and an End discount action once approved', async () => {
    setup({
      search: { tab: 'discounts' },
      discounts: discountList([
        discountRow({ status: 'approved', approvedBy: 'Grace Nwosu' }),
      ]),
    });
    const row = (await screen.findByText('Halima Bello')).closest(
      'tr'
    ) as HTMLElement;
    expect(within(row).getByText('50% tuition')).toBeVisible();
    expect(
      within(row).getByText('Second term, 2026/2027 to Third term, 2026/2027')
    ).toBeVisible();
    expect(within(row).getByText('Approved')).toBeVisible();
    expect(
      await within(row).findByRole('button', { name: /End discount/ })
    ).toBeVisible();
  });

  it('offers no End action once the discount’s last term is behind the current one', async () => {
    const { api } = setup({
      search: { tab: 'discounts' },
      years: [
        schoolYear({
          terms: [
            term({ id: 't1', name: 'First term' }),
            term({
              id: 't2',
              name: 'Second term',
              startsOn: '2027-01-04',
              isCurrent: true,
            }),
          ],
        }),
      ],
      discounts: discountList([
        discountRow({
          status: 'approved',
          approvedBy: 'Grace Nwosu',
          fromTerm: { id: 't1', name: 'First term' },
          toTerm: { id: 't1', name: 'First term' },
        }),
      ]),
    });
    const row = (await screen.findByText('Halima Bello')).closest(
      'tr'
    ) as HTMLElement;
    await waitFor(() => {
      expect(api.studentDiscounts.terms).toHaveBeenCalled();
      expect(
        within(row).queryByRole('button', { name: /End discount/ })
      ).toBeNull();
    });
  });

  it('calls a stopped discount Ended and offers no End action', async () => {
    setup({
      search: { tab: 'discounts' },
      discounts: discountList([
        discountRow({
          status: 'approved',
          endedAt: '2026-10-20T09:00:00.000Z',
        }),
      ]),
    });
    const row = (await screen.findByText('Halima Bello')).closest(
      'tr'
    ) as HTMLElement;
    expect(within(row).getByText('Ended')).toBeVisible();
    expect(
      within(row).queryByRole('button', { name: /End discount/ })
    ).toBeNull();
  });

  it('says No discounts when there are none', async () => {
    setup({ search: { tab: 'discounts' }, discounts: discountList([]) });
    expect(await screen.findByText('No discounts')).toBeVisible();
  });

  it('offers New request on the corrections tab and New discount on the discounts tab', async () => {
    const corrections = setup();
    expect(
      await screen.findByRole('button', { name: 'New request' })
    ).toBeVisible();
    expect(corrections.api.adjustments.list).toHaveBeenCalled();
  });

  it('offers New discount on the discounts tab', async () => {
    setup({ search: { tab: 'discounts' } });
    expect(
      await screen.findByRole('button', { name: 'New discount' })
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'New request' })).toBeNull();
  });

  it('gives a principal the lists but no New request', async () => {
    setup({ access: starterAccess('principal') });
    await screen.findByText('Bola Johnson');
    expect(screen.queryByRole('button', { name: 'New request' })).toBeNull();
  });

  it('switches tab through the search and drops the page', async () => {
    const { onSearchChange } = setup({ search: { page: 2 } });
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /Discounts/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Discounts/ }));
    await waitFor(() => {
      expect(onSearchChange).toHaveBeenCalledWith({ tab: 'discounts' });
    });
  });
});

const NEW_REQUEST: AdjustmentsSearch = { new: 1 };

async function openSheet(search?: AdjustmentsSearch) {
  const ctx = setup({ search: search ?? NEW_REQUEST });
  return { ...ctx, sheet: await screen.findByRole('dialog') };
}

describe('the New request sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says a boss must approve it, lists the kinds and the in-scope students', async () => {
    const { sheet } = await openSheet();
    expect(
      await within(sheet).findByText(
        'A boss must approve it before it takes effect.'
      )
    ).toBeVisible();
    const kinds = within(sheet).getByLabelText<HTMLSelectElement>('Kind');
    expect([...kinds.options].map((option) => option.text)).toEqual([
      'Reduce a fee',
      'Cancel a balance',
      'Refund',
    ]);
    const students =
      await within(sheet).findByLabelText<HTMLSelectElement>('Student');
    await waitFor(() => {
      expect([...students.options].map((option) => option.text)).toEqual([
        'Choose a student',
        'Ada Okeke · GF-0123',
        'Bola Johnson · GF-0087',
      ]);
    });
  });

  it('searches the school’s students on the server as the name is typed', async () => {
    const { api, sheet } = await openSheet();
    await within(sheet).findByLabelText('Student');

    fireEvent.change(within(sheet).getByLabelText('Find a student'), {
      target: { value: 'bol' },
    });

    await waitFor(() => {
      expect(api.students.list).toHaveBeenCalledWith({
        query: { tab: 'active', pageSize: 20, q: 'bol' },
      });
    });
    const students = within(sheet).getByLabelText<HTMLSelectElement>('Student');
    await waitFor(() => {
      expect([...students.options].map((option) => option.text)).toEqual([
        'Choose a student',
        'Bola Johnson · GF-0087',
      ]);
    });
  });

  it('does not submit the sheet when Enter is pressed in the student search', async () => {
    const { sheet } = await openSheet();
    const search = await within(sheet).findByLabelText('Find a student');

    const notPrevented = fireEvent.keyDown(search, { key: 'Enter' });

    expect(notPrevented).toBe(false);
  });

  it('keeps a student sent from "Pay the extra back" when the first results do not hold them', async () => {
    const { api } = setup({
      search: { new: 1, kind: 'refund', student: ADA, amount: 500_000 },
      students: [BOLA_ROW],
    });
    const sheet = await screen.findByRole('dialog');

    await waitFor(() => {
      expect(within(sheet).getByLabelText('Student')).toHaveValue(ADA);
    });
    expect(api.students.get).toHaveBeenCalledWith({ params: { id: ADA } });
    const students = within(sheet).getByLabelText<HTMLSelectElement>('Student');
    expect([...students.options].map((option) => option.text)).toEqual([
      'Choose a student',
      'Ada Okeke · GF-0123',
      'Bola Johnson · GF-0087',
    ]);
  });

  it('says it goes through straight away when approval is switched off for the kind', async () => {
    setup({ search: { new: 1 }, rules: { creditNote: false } });
    const sheet = await screen.findByRole('dialog');
    expect(
      await within(sheet).findByText(
        'This goes through straight away; approval is switched off for it.'
      )
    ).toBeVisible();
  });

  it('opens as a refund of the credit held when sent from "Pay the extra back"', async () => {
    const { sheet } = await openSheet({
      new: 1,
      kind: 'refund',
      student: ADA,
      amount: 500_000,
    });
    await waitFor(() => {
      expect(within(sheet).getByLabelText('Kind')).toHaveValue('refund');
    });
    expect(within(sheet).getByLabelText('Amount (₦)')).toHaveValue('5000');
    await waitFor(() => {
      expect(within(sheet).getByLabelText('Student')).toHaveValue(ADA);
    });
  });

  it('asks for a student and an amount, then a reason, before sending anything', async () => {
    const { api, sheet } = await openSheet();
    await within(sheet).findByLabelText('Student');

    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Submit for approval' })
    );

    expect(
      await within(sheet).findByText('Choose a student and enter an amount.')
    ).toBeVisible();
    expect(
      within(sheet).getByText('Say why. It shows on the statement.')
    ).toBeVisible();
    expect(api.adjustments.create).not.toHaveBeenCalled();
  });

  it('submits a fee reduction and toasts with an Approvals inbox action', async () => {
    const { api, sheet } = await openSheet();
    await waitFor(() => {
      expect(within(sheet).getByLabelText('Student')).toBeEnabled();
    });
    await within(sheet).findByRole('option', { name: 'Ada Okeke · GF-0123' });
    fireEvent.change(within(sheet).getByLabelText('Student'), {
      target: { value: ADA },
    });
    fireEvent.change(within(sheet).getByLabelText('Amount (₦)'), {
      target: { value: '10,000' },
    });
    fireEvent.change(within(sheet).getByLabelText('Reason'), {
      target: { value: 'Late enrolment' },
    });

    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Submit for approval' })
    );

    await waitFor(() => {
      expect(api.adjustments.create).toHaveBeenCalledWith({
        body: {
          kind: 'credit_note',
          studentId: ADA,
          amountMinor: 1_000_000,
          reason: 'Late enrolment',
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Submitted. A boss must approve it.',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Approvals inbox' }),
        })
      );
    });
  });

  it('says it was applied straight away when the kind needs no approval', async () => {
    const ctx = setup({
      search: { new: 1 },
      autoApproved: true,
      rules: { creditNote: false },
    });
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByRole('option', { name: 'Ada Okeke · GF-0123' });
    fireEvent.change(within(sheet).getByLabelText('Student'), {
      target: { value: ADA },
    });
    fireEvent.change(within(sheet).getByLabelText('Amount (₦)'), {
      target: { value: '100' },
    });
    fireEvent.change(within(sheet).getByLabelText('Reason'), {
      target: { value: 'Late' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Submit for approval' })
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Done. This request type does not need approval, so it was applied straight away.'
      );
    });
    expect(ctx.api.adjustments.create).toHaveBeenCalled();
  });

  it('shows the cap message from the API when a refund asks for more than the credit held', async () => {
    const message =
      'A refund pays back credit held. Ada Okeke holds ₦5,000 credit.';
    setup({
      search: { new: 1, kind: 'refund', student: ADA, amount: 600_000 },
      createFails: new ApiError(400, {
        code: 'BadRequest',
        message,
        creditMinor: 500_000,
      }),
    });
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByRole('option', { name: 'Ada Okeke · GF-0123' });
    fireEvent.change(within(sheet).getByLabelText('Reason'), {
      target: { value: 'Overpaid' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Submit for approval' })
    );

    expect(await within(sheet).findByText(message)).toBeVisible();
  });

  it('sends a refund with the money account it is paid from', async () => {
    const { api } = setup({
      search: { new: 1, kind: 'refund', student: ADA, amount: 500_000 },
    });
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByRole('option', { name: 'Ada Okeke · GF-0123' });
    await waitFor(() => {
      expect(api.moneyAccounts.forRecording).toHaveBeenCalled();
    });
    fireEvent.change(within(sheet).getByLabelText('Reason'), {
      target: { value: 'Overpaid' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Submit for approval' })
    );

    await waitFor(() => {
      expect(api.adjustments.create).toHaveBeenCalledWith({
        body: expect.objectContaining({
          kind: 'refund',
          moneyAccountId: ACCOUNT,
          amountMinor: 500_000,
        }),
      });
    });
  });

  it('offers the student’s sent charges for a fee reduction', async () => {
    const { api } = setup({ search: { new: 1, student: ADA } });
    const sheet = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(api.invoices.list).toHaveBeenCalled();
    });
    expect(
      await within(sheet).findByRole('option', {
        name: 'CHG-2026-00012 · First term · ₦220,000',
      })
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole('option', {
        name: 'CHG-2026-00031 · Excursion · ₦15,000',
      })
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole('option', { name: 'Not tied to a charge' })
    ).toBeInTheDocument();
    expect(api.invoices.list).toHaveBeenCalledWith({
      query: { studentId: ADA, status: 'issued', pageSize: 50 },
    });
  });
});

describe('the New discount sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the fee types with Tuition first, the whole charge last and the terms from the current one', async () => {
    setup({ search: { tab: 'discounts', new: 1 } });
    const sheet = await screen.findByRole('dialog');
    expect(
      await within(sheet).findByText(
        'Applies at the next round of charges once approved.'
      )
    ).toBeVisible();
    const applies =
      await within(sheet).findByLabelText<HTMLSelectElement>('Applies to');
    await waitFor(() => {
      expect([...applies.options].map((option) => option.text)).toEqual([
        'Tuition',
        'PTA fee',
        'Whole charge',
      ]);
    });
    const from = within(sheet).getByLabelText<HTMLSelectElement>('From');
    expect(from.value).toBe('t2');
    expect(from.options[0]?.text).toBe('First term, 2026/2027');
    expect([...from.options].map((option) => option.text)).toContain(
      'First term, 2027/2028'
    );
    const until = within(sheet).getByLabelText<HTMLSelectElement>('Until');
    expect(until.options[0]?.text).toBe('No end');
  });

  it('asks for a student and a value, and refuses a percentage above 100', async () => {
    const { api } = setup({ search: { tab: 'discounts', new: 1 } });
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByRole('option', { name: 'Ada Okeke · GF-0123' });

    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Submit for approval' })
    );
    expect(
      await within(sheet).findByText('Choose a student and enter a value.')
    ).toBeVisible();

    fireEvent.change(within(sheet).getByLabelText('Student'), {
      target: { value: ADA },
    });
    fireEvent.change(within(sheet).getByLabelText('Value'), {
      target: { value: '120' },
    });
    fireEvent.change(within(sheet).getByLabelText('Reason'), {
      target: { value: 'Staff child' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Submit for approval' })
    );
    expect(
      await within(sheet).findByText('A percentage can be at most 100.')
    ).toBeVisible();
    expect(api.studentDiscounts.create).not.toHaveBeenCalled();
  });

  it('submits a percentage discount and toasts that it was submitted for approval', async () => {
    const { api } = setup({ search: { tab: 'discounts', new: 1 } });
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByRole('option', { name: 'Ada Okeke · GF-0123' });
    fireEvent.change(within(sheet).getByLabelText('Student'), {
      target: { value: ADA },
    });
    fireEvent.change(within(sheet).getByLabelText('Value'), {
      target: { value: '10' },
    });
    fireEvent.change(within(sheet).getByLabelText('Reason'), {
      target: { value: 'Staff child' },
    });

    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Submit for approval' })
    );

    await waitFor(() => {
      expect(api.studentDiscounts.create).toHaveBeenCalledWith({
        body: {
          studentId: ADA,
          kind: 'percent',
          value: 10,
          ledgerAccountId: TUITION,
          fromTermId: 't2',
          toTermId: null,
          reason: 'Staff child',
        },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Discount submitted for approval.',
        expect.anything()
      );
    });
  });

  it('applies at once and says so when discounts are switched off', async () => {
    setup({
      search: { tab: 'discounts', new: 1 },
      autoApproved: true,
      rules: { discount: false },
    });
    const sheet = await screen.findByRole('dialog');
    await within(sheet).findByRole('option', { name: 'Ada Okeke · GF-0123' });
    fireEvent.change(within(sheet).getByLabelText('Student'), {
      target: { value: ADA },
    });
    fireEvent.change(within(sheet).getByLabelText('Value'), {
      target: { value: '10' },
    });
    fireEvent.change(within(sheet).getByLabelText('Reason'), {
      target: { value: 'Staff child' },
    });
    fireEvent.click(
      within(sheet).getByRole('button', { name: 'Submit for approval' })
    );

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Discount applied. It shows on the next round of charges.'
      );
    });
  });
});

describe('the End discount dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers the current term onward up to the existing Until and ends with the term chosen', async () => {
    const { api } = setup({
      search: { tab: 'discounts' },
      discounts: discountList([
        discountRow({
          status: 'approved',
          toTerm: { id: 't3', name: 'Third term, 2026/2027' },
        }),
      ]),
    });
    fireEvent.click(
      await screen.findByRole('button', { name: /End discount/ })
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('End this discount?')).toBeVisible();
    expect(
      within(dialog).getByText('Halima Bello · 50% tuition')
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        'Charges already sent don’t change. Later charges no longer get this discount.'
      )
    ).toBeVisible();
    const last = await within(dialog).findByLabelText<HTMLSelectElement>(
      'Last term it applies to'
    );
    await waitFor(() => {
      expect([...last.options].map((option) => option.value)).toEqual([
        't1',
        't2',
        't3',
      ]);
    });
    fireEvent.change(last, { target: { value: 't2' } });

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'End discount' })
    );

    await waitFor(() => {
      expect(api.studentDiscounts.end).toHaveBeenCalledWith({
        params: { id: DISCOUNT_ID },
        body: { lastTermId: 't2' },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Discount ended. It last applies in')
      );
    });
  });
});
