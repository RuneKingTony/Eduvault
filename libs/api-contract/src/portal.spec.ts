import { contract } from './contract';
import {
  isNewAnnouncement,
  newAnnouncementsSince,
  portalAnnouncementListQuerySchema,
  portalAnnouncementsQuerySchema,
  portalChildSchema,
  portalFamilyStatementSchema,
  portalMeSchema,
  portalPriceListSchema,
  portalPurchasesSchema,
  portalStatementQuerySchema,
  portalStatementSchema,
  portalStudentParamsSchema,
  portalStudentSchema,
} from './portal';

const id = '0b0c8a8e-8a3e-4c6c-a8c4-0e2f0f6b1f11';

const child = {
  id,
  firstName: 'Ada',
  lastName: 'Okeke',
  className: null,
  campusName: 'Lekki',
  archived: false,
};

describe('portal schemas', () => {
  it('accepts a child without a class', () => {
    expect(portalChildSchema.parse(child)).toEqual(child);
  });

  it('takes an optional whole-number balance, negative when in credit', () => {
    expect(portalChildSchema.parse({ ...child, balanceMinor: -500 })).toEqual({
      ...child,
      balanceMinor: -500,
    });
    expect(
      portalChildSchema.safeParse({ ...child, balanceMinor: 1.5 }).success
    ).toBe(false);
  });

  it('accepts a guardian login with no email and a student login with no email', () => {
    const me = {
      kind: 'guardian',
      name: 'Ngozi Okeke',
      firstName: 'Ngozi',
      login: { username: 'ngozi.okeke', email: null },
      school: {
        name: 'Greenfield',
        admissionPrefix: 'GF',
        currency: 'NGN',
        logoUrl: null,
      },
      children: [child],
    };
    expect(portalMeSchema.parse(me)).toEqual(me);
    expect(portalMeSchema.safeParse({ ...me, kind: 'staff' }).success).toBe(
      false
    );
  });

  it('describes a student with a class teacher or none', () => {
    const student = {
      id,
      firstName: 'Ada',
      lastName: 'Okeke',
      admissionNumber: 'GF-0123',
      dateOfBirth: '2014-05-02',
      className: 'JSS 1 A',
      campusName: 'Lekki',
      classTeacherName: null,
      username: 'greenfield-0123',
      archived: false,
    };
    expect(portalStudentSchema.parse(student)).toEqual(student);
  });

  it('wants a student id in the path', () => {
    expect(portalStudentParamsSchema.safeParse({ studentId: id }).success).toBe(
      true
    );
    expect(
      portalStudentParamsSchema.safeParse({ studentId: 'nope' }).success
    ).toBe(false);
  });

  it('defaults the announcement limit to five and caps it at five', () => {
    expect(portalAnnouncementsQuerySchema.parse({}).limit).toBe(5);
    expect(portalAnnouncementsQuerySchema.parse({ limit: '3' }).limit).toBe(3);
    expect(
      portalAnnouncementsQuerySchema.safeParse({ limit: '6' }).success
    ).toBe(false);
    expect(
      portalAnnouncementsQuerySchema.safeParse({ limit: '0' }).success
    ).toBe(false);
  });
});

describe('the full announcement list query', () => {
  it('pages ten at a time from the first page and caps a page at fifty', () => {
    expect(portalAnnouncementListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 10,
    });
    expect(
      portalAnnouncementListQuerySchema.parse({ page: '2', pageSize: '50' })
    ).toEqual({ page: 2, pageSize: 50 });
    for (const query of [
      { page: '0' },
      { pageSize: '51' },
      { pageSize: '0' },
    ]) {
      expect(portalAnnouncementListQuerySchema.safeParse(query).success).toBe(
        false
      );
    }
  });
});

describe('the new-this-week window', () => {
  it('starts seven days before today', () => {
    expect(newAnnouncementsSince('2026-10-11')).toBe('2026-10-04');
    expect(newAnnouncementsSince('2026-03-03')).toBe('2026-02-24');
    expect(newAnnouncementsSince('2027-01-03')).toBe('2026-12-27');
  });

  it('counts day seven as new and day eight as old', () => {
    expect(isNewAnnouncement('2026-10-04', '2026-10-11')).toBe(true);
    expect(isNewAnnouncement('2026-10-03', '2026-10-11')).toBe(false);
    expect(isNewAnnouncement('2026-10-11', '2026-10-11')).toBe(true);
  });
});

describe('the portal routes', () => {
  it('are all reads', () => {
    for (const route of Object.values(contract.portal)) {
      expect(route.method).toBe('GET');
    }
    expect(
      Object.keys(contract.portal).toSorted((a, b) => a.localeCompare(b))
    ).toEqual([
      'announcementList',
      'announcements',
      'children',
      'familyStatement',
      'me',
      'priceList',
      'purchases',
      'statement',
      'student',
    ]);
  });
});

const statement = {
  currency: 'NGN',
  student: {
    id,
    name: 'Ada Okeke',
    admissionNumber: 'GF-0123',
    className: 'JSS 1 A',
    campusName: 'Lekki',
    archived: false,
  },
  totals: {
    balanceMinor: 6_000_000,
    totalMinor: 10_000_000,
    paidMinor: 4_000_000,
    reducedMinor: 0,
  },
  rows: [
    {
      effectiveOn: '2026-09-01',
      description: 'Tuition',
      status: 'charged',
      amountMinor: 10_000_000,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 10,
  unpaid: [{ number: 'INV-0001', outstandingMinor: 6_000_000 }],
  term: null,
  broughtForward: null,
  closingMinor: null,
  termOptions: [],
};

describe('the portal statement query', () => {
  it('leaves the page open and pages ten at a time', () => {
    expect(portalStatementQuerySchema.parse({})).toEqual({ pageSize: 10 });
    expect(portalStatementQuerySchema.parse({ page: '2' }).page).toBe(2);
    expect(portalStatementQuerySchema.safeParse({ page: '0' }).success).toBe(
      false
    );
    expect(
      portalStatementQuerySchema.safeParse({ pageSize: '51' }).success
    ).toBe(false);
  });

  it('takes an optional term id and refuses anything that is not an id', () => {
    expect(portalStatementQuerySchema.parse({ termId: id }).termId).toBe(id);
    expect(portalStatementQuerySchema.parse({}).termId).toBeUndefined();
    expect(
      portalStatementQuerySchema.safeParse({ termId: 'nope' }).success
    ).toBe(false);
  });
});

describe('the portal statement', () => {
  it('takes all five statuses', () => {
    for (const status of [
      'charged',
      'paid',
      'reduced',
      'cancelled',
      'refunded',
    ]) {
      const rows = [{ ...statement.rows[0], status }];
      expect(
        portalStatementSchema.safeParse({ ...statement, rows }).success
      ).toBe(true);
    }
    const rows = [{ ...statement.rows[0], status: 'void' }];
    expect(
      portalStatementSchema.safeParse({ ...statement, rows }).success
    ).toBe(false);
  });

  it('accepts a chosen term with its brought forward, closing and options', () => {
    const filled = {
      ...statement,
      term: {
        id,
        label: 'First term, 2026/2027',
        fromOn: '2026-09-01',
        toOn: '2026-12-18',
      },
      broughtForward: { amountMinor: 0 },
      closingMinor: 6_000_000,
      termOptions: [{ id, label: 'First term, 2026/2027' }],
    };
    expect(portalStatementSchema.parse(filled)).toEqual(filled);
    expect(
      portalStatementSchema.safeParse({ ...filled, closingMinor: 1.5 }).success
    ).toBe(false);
  });

  it('strips a reference, link or entry id from a row', () => {
    const row = {
      ...statement.rows[0],
      reference: 'RCT-0001',
      link: { type: 'payment', id },
      entryId: id,
    };
    const parsed = portalStatementSchema.parse({ ...statement, rows: [row] });
    expect(parsed.rows[0]).toEqual(statement.rows[0]);
    expect(parsed.rows[0]).not.toHaveProperty('reference');
    expect(parsed.rows[0]).not.toHaveProperty('link');
    expect(parsed.rows[0]).not.toHaveProperty('entryId');
  });

  it('describes an unpaid charge by number and outstanding amount only', () => {
    const unpaid = [
      {
        number: 'INV-0001',
        outstandingMinor: 100,
        link: { type: 'invoice', id },
      },
    ];
    const parsed = portalStatementSchema.parse({ ...statement, unpaid });
    expect(parsed.unpaid).toEqual([
      { number: 'INV-0001', outstandingMinor: 100 },
    ]);
  });
});

describe('the portal family statement', () => {
  const family = {
    currency: 'NGN',
    totalOwedMinor: 10_000_000,
    creditMinor: 2_000_000,
    children: [
      {
        studentId: id,
        name: 'Ada Okeke',
        className: null,
        campusName: 'Lekki',
        archived: true,
        balanceMinor: -2_000_000,
      },
    ],
  };

  it('keeps what is owed and the credit apart, neither below zero', () => {
    expect(portalFamilyStatementSchema.parse(family)).toEqual(family);
    expect(
      portalFamilyStatementSchema.safeParse({ ...family, creditMinor: -1 })
        .success
    ).toBe(false);
    expect(
      portalFamilyStatementSchema.safeParse({ ...family, totalOwedMinor: -1 })
        .success
    ).toBe(false);
  });

  it('is served at its own path with the statement under a student', () => {
    expect(contract.portal.familyStatement.path).toBe(
      '/portal/family-statement'
    );
    expect(contract.portal.statement.path).toBe(
      '/portal/students/:studentId/statement'
    );
  });
});

describe('portalPurchasesSchema', () => {
  const purchases = {
    termName: 'First term',
    spentThisTermMinor: 650_000,
    termPurchaseCount: 1,
    itemsBought: 2,
    sales: [
      {
        id,
        date: '2026-09-08',
        campusName: 'Lekki',
        receiptNumber: 'RCT-2026-0001',
        method: 'pos',
        totalMinor: 650_000,
        lines: [
          {
            itemName: 'Mathematics',
            quantity: 2,
            unitPriceMinor: 325_000,
            amountMinor: 650_000,
          },
        ],
      },
    ],
  };

  it('parses the sales with their frozen line prices', () => {
    expect(portalPurchasesSchema.parse(purchases)).toEqual(purchases);
  });

  it('takes no sales and no current term', () => {
    expect(
      portalPurchasesSchema.safeParse({
        termName: null,
        spentThisTermMinor: 0,
        termPurchaseCount: 0,
        itemsBought: 0,
        sales: [],
      }).success
    ).toBe(true);
  });

  it('refuses a method the school never offered', () => {
    expect(
      portalPurchasesSchema.safeParse({
        ...purchases,
        sales: [{ ...purchases.sales[0], method: 'cheque' }],
      }).success
    ).toBe(false);
  });
});

describe('portalPriceListSchema', () => {
  it('lists books, uniform sizes with a price range and the ways to pay', () => {
    const list = {
      levelName: 'JSS 2',
      books: [{ name: 'Mathematics', priceMinor: 325_000, inStock: false }],
      uniforms: [
        {
          name: 'School shirt',
          sizes: ['Size 10', 'Size 12'],
          minPriceMinor: 350_000,
          maxPriceMinor: 450_000,
          inStock: true,
        },
      ],
      paymentMethods: ['cash', 'pos'],
    };
    expect(portalPriceListSchema.parse(list)).toEqual(list);
  });
});
