import {
  campusForTerm,
  chargedState,
  defaultTermId,
  scopeLabel,
  settleCounts,
  type CampusPlacement,
} from './billing-round';

const facts = (over: Partial<CampusPlacement> = {}): CampusPlacement => ({
  termPlacementCampusId: 'lekki',
  latestPlacementCampusId: 'lekki',
  homeCampusId: 'lekki',
  ...over,
});

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
