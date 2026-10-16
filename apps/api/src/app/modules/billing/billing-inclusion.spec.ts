import {
  campusForTerm,
  chargedState,
  defaultTermId,
  isIncluded,
  outcomeOf,
  scopeLabel,
  settleCounts,
  tallyOutcomes,
  type InclusionFacts,
} from './billing-inclusion';

const facts = (over: Partial<InclusionFacts> = {}): InclusionFacts => ({
  enrollmentStatus: 'active',
  life: 'active',
  currentCampusId: 'lekki',
  termPlacementCampusId: 'lekki',
  latestPlacementCampusId: 'lekki',
  homeCampusId: 'lekki',
  classLevelId: 'jss2',
  ...over,
});

const school = { scope: 'school' } as const;

describe('campusForTerm', () => {
  it('prefers the placement for the term', () => {
    expect(
      campusForTerm(
        facts({
          termPlacementCampusId: 'ikeja',
          latestPlacementCampusId: 'lekki',
          homeCampusId: 'abuja',
        })
      )
    ).toBe('ikeja');
  });

  it('falls back to the latest placement in the school year', () => {
    expect(
      campusForTerm(
        facts({
          termPlacementCampusId: null,
          latestPlacementCampusId: 'ikeja',
          homeCampusId: 'abuja',
        })
      )
    ).toBe('ikeja');
  });

  it('falls back to the home campus with no placement at all', () => {
    expect(
      campusForTerm(
        facts({
          termPlacementCampusId: null,
          latestPlacementCampusId: null,
          homeCampusId: 'abuja',
        })
      )
    ).toBe('abuja');
  });
});

describe('isIncluded', () => {
  it('takes an active student with an active enrolment in scope', () => {
    expect(isIncluded(facts(), school, 'all')).toBe(true);
  });

  it('leaves out withdrawn, completed and missing enrolments', () => {
    for (const enrollmentStatus of ['withdrawn', 'completed', null] as const) {
      expect(isIncluded(facts({ enrollmentStatus }), school, 'all')).toBe(
        false
      );
    }
  });

  it('leaves out inactive, left and graduated students', () => {
    for (const life of ['inactive', 'left', 'graduated'] as const) {
      expect(isIncluded(facts({ life }), school, 'all')).toBe(false);
    }
  });

  it('keeps only students on a campus the caller sees now', () => {
    const ikeja = facts({ currentCampusId: 'ikeja' });
    expect(isIncluded(ikeja, school, ['lekki'])).toBe(false);
    expect(isIncluded(ikeja, school, ['lekki', 'ikeja'])).toBe(true);
    expect(isIncluded(ikeja, school, [])).toBe(false);
  });

  it('matches One campus on the campus for the term, not the current one', () => {
    const moved = facts({
      currentCampusId: 'lekki',
      termPlacementCampusId: 'ikeja',
    });
    expect(
      isIncluded(moved, { scope: 'campus', campusId: 'ikeja' }, 'all')
    ).toBe(true);
    expect(
      isIncluded(moved, { scope: 'campus', campusId: 'lekki' }, 'all')
    ).toBe(false);
  });

  it('matches One campus on the home campus when the term has no placement', () => {
    const unplaced = facts({
      termPlacementCampusId: null,
      latestPlacementCampusId: null,
      homeCampusId: 'abuja',
      currentCampusId: 'abuja',
    });
    expect(
      isIncluded(unplaced, { scope: 'campus', campusId: 'abuja' }, 'all')
    ).toBe(true);
  });

  it('matches One level on the enrolment level', () => {
    expect(
      isIncluded(facts(), { scope: 'level', classLevelId: 'jss2' }, 'all')
    ).toBe(true);
    expect(
      isIncluded(facts(), { scope: 'level', classLevelId: 'jss1' }, 'all')
    ).toBe(false);
  });
});

describe('outcomeOf and tallyOutcomes', () => {
  it('calls a student with a live charge skipped even with no fees left', () => {
    expect(outcomeOf({ alreadyCharged: true, lineCount: 0 })).toBe('skipped');
    expect(outcomeOf({ alreadyCharged: true, lineCount: 3 })).toBe('skipped');
  });

  it('calls an uncharged student with no fee lines none, otherwise create', () => {
    expect(outcomeOf({ alreadyCharged: false, lineCount: 0 })).toBe('none');
    expect(outcomeOf({ alreadyCharged: false, lineCount: 2 })).toBe('create');
  });

  it('counts each outcome', () => {
    expect(
      tallyOutcomes(['create', 'create', 'skipped', 'none', 'create'])
    ).toEqual({ created: 3, skipped: 1, none: 1 });
    expect(tallyOutcomes([])).toEqual({ created: 0, skipped: 0, none: 0 });
  });
});

describe('settleCounts', () => {
  it('moves students a concurrent prepare charged first from created to skipped', () => {
    expect(settleCounts({ created: 5, skipped: 2, none: 1 }, 3)).toEqual({
      created: 3,
      skipped: 4,
      none: 1,
    });
  });

  it('changes nothing when every insert landed', () => {
    expect(settleCounts({ created: 5, skipped: 2, none: 1 }, 5)).toEqual({
      created: 5,
      skipped: 2,
      none: 1,
    });
  });
});

describe('chargedState and defaultTermId', () => {
  it('is none, partly or all by who is already charged', () => {
    expect(chargedState({ created: 4, skipped: 0 })).toBe('none');
    expect(chargedState({ created: 0, skipped: 0 })).toBe('none');
    expect(chargedState({ created: 1, skipped: 3 })).toBe('partly');
    expect(chargedState({ created: 0, skipped: 4 })).toBe('all');
  });

  it('defaults to the first term not fully charged', () => {
    expect(
      defaultTermId([
        { termId: 'first', charged: 'all' },
        { termId: 'second', charged: 'none' },
      ])
    ).toBe('second');
    expect(
      defaultTermId([
        { termId: 'first', charged: 'partly' },
        { termId: 'second', charged: 'none' },
      ])
    ).toBe('first');
  });

  it('falls back to the current term when both are charged, and to nothing with no terms', () => {
    expect(
      defaultTermId([
        { termId: 'first', charged: 'all' },
        { termId: 'second', charged: 'all' },
      ])
    ).toBe('first');
    expect(defaultTermId([])).toBeUndefined();
  });
});

describe('scopeLabel', () => {
  it('names the whole school, a campus or a level', () => {
    expect(scopeLabel('school', null)).toBe('Whole school');
    expect(scopeLabel('campus', 'Lekki')).toBe('Campus: Lekki');
    expect(scopeLabel('level', 'JSS 2')).toBe('Level: JSS 2');
  });
});
