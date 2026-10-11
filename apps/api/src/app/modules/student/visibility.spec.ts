import {
  effectiveCampusId,
  isStudentVisible,
  type VisibilityFacts,
} from './visibility';

const placed: VisibilityFacts = {
  homeCampusId: 'lekki',
  currentPlacement: { campusId: 'ikeja', armId: 'arm-ikeja' },
};

const unplaced: VisibilityFacts = {
  homeCampusId: 'lekki',
  currentPlacement: null,
};

describe('effectiveCampusId', () => {
  it('is the placement campus, and the home campus without one', () => {
    expect(effectiveCampusId(placed)).toBe('ikeja');
    expect(effectiveCampusId(unplaced)).toBe('lekki');
  });
});

describe('isStudentVisible', () => {
  it('shows everything to a caller with every campus and every class', () => {
    expect(
      isStudentVisible(placed, { campusScope: 'all', classScope: 'all' })
    ).toBe(true);
  });

  it('applies the campus scope to the effective campus', () => {
    const lekkiOnly = { campusScope: ['lekki'], classScope: 'all' as const };
    expect(isStudentVisible(placed, lekkiOnly)).toBe(false);
    expect(isStudentVisible(unplaced, lekkiOnly)).toBe(true);
    expect(
      isStudentVisible(placed, {
        campusScope: ['ikeja'],
        classScope: 'all',
      })
    ).toBe(true);
  });

  it('applies the class scope to the current placement arm', () => {
    const teacher = { campusScope: 'all' as const, classScope: ['arm-ikeja'] };
    expect(isStudentVisible(placed, teacher)).toBe(true);
    expect(
      isStudentVisible(placed, { campusScope: 'all', classScope: ['other'] })
    ).toBe(false);
  });

  it('hides an unplaced student from a class-scoped caller', () => {
    expect(
      isStudentVisible(unplaced, {
        campusScope: 'all',
        classScope: ['arm-ikeja'],
      })
    ).toBe(false);
    expect(
      isStudentVisible(unplaced, { campusScope: 'all', classScope: [] })
    ).toBe(false);
  });

  it('needs both scopes to pass', () => {
    expect(
      isStudentVisible(placed, {
        campusScope: ['lekki'],
        classScope: ['arm-ikeja'],
      })
    ).toBe(false);
  });
});
