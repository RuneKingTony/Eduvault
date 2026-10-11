import { IDS } from '../test-classes';
import { studentDetail } from '../test-students';
import {
  backInSchoolToast,
  classOptionLabel,
  defaultLastDay,
  defaultLeaveReason,
  defaultMoveClass,
  defaultNotSeenDate,
  leavesScope,
  markAwayToast,
  menuItems,
} from './student-lifecycle-model';

const everything = { place: true, markAway: true, archive: true };

const labels = (
  student: Parameters<typeof menuItems>[0],
  caps = everything
): string[] => menuItems(student, caps).map((item) => item.label);

describe('dialog defaults', () => {
  it('defaults the not-seen date to seven days before today', () => {
    expect(defaultNotSeenDate('2026-10-07')).toBe('2026-09-30');
    expect(defaultNotSeenDate('2026-03-03')).toBe('2026-02-24');
  });

  it('defaults the leaving reason by state', () => {
    expect(defaultLeaveReason('inactive')).toBe('did_not_return');
    expect(defaultLeaveReason('active')).toBe('relocated');
  });

  it('defaults the last day to the not-seen-since date, else today', () => {
    expect(defaultLastDay({ notSeenSince: '2026-09-01' }, '2026-10-07')).toBe(
      '2026-09-01'
    );
    expect(defaultLastDay({ notSeenSince: null }, '2026-10-07')).toBe(
      '2026-10-07'
    );
  });
});

describe('menuItems', () => {
  const marked = { notSeenSince: '2026-10-01', weeksAway: 1 };

  it('offers move, mark away and record leaving to an active student', () => {
    expect(labels(studentDetail({ canMoveForNextTerm: true }))).toEqual([
      'Move for next term',
      'Mark not seen since…',
      'Record leaving…',
    ]);
  });

  it('hides Move without a next term, a placement gap or the permission', () => {
    expect(labels(studentDetail())).not.toContain('Move for next term');
    expect(
      labels(studentDetail({ canMoveForNextTerm: true }), {
        ...everything,
        place: false,
      })
    ).not.toContain('Move for next term');
  });

  it('swaps mark away for back in school once marked, and for Reactivate when inactive', () => {
    expect(labels(studentDetail(marked))).toEqual([
      'Back in school',
      'Record leaving…',
    ]);
    expect(labels(studentDetail({ ...marked, life: 'inactive' }))[0]).toBe(
      'Reactivate: back in school'
    );
  });

  it('offers only Undo to an archived student when the term is still current', () => {
    const left = {
      life: 'left' as const,
      exit: {
        kind: 'left' as const,
        on: '2026-10-02',
        reason: 'Relocated',
        note: null,
        recordedOn: '2026-10-07',
      },
    };
    expect(labels(studentDetail({ ...left, canUndoLeaving: true }))).toEqual([
      'Undo leaving…',
    ]);
    expect(labels(studentDetail(left))).toEqual([]);
    expect(
      labels(
        studentDetail({
          ...left,
          exit: { ...left.exit, kind: 'graduated' },
          canUndoLeaving: true,
        })
      )
    ).toEqual(['Undo graduation…']);
  });

  it('marks Record leaving destructive and honours each permission', () => {
    const items = menuItems(studentDetail(), everything);
    expect(items.find((item) => item.action === 'leave')?.destructive).toBe(
      true
    );
    expect(
      labels(studentDetail(), { place: true, markAway: false, archive: false })
    ).toEqual([]);
    expect(
      labels(studentDetail(), { place: false, markAway: true, archive: false })
    ).toEqual(['Mark not seen since…']);
  });
});

describe('toasts', () => {
  it('warns when marking away puts the student Inactive at once', () => {
    expect(
      markAwayToast(
        { firstName: 'Ada' },
        { date: '2026-08-28', today: '2026-10-07' }
      )
    ).toEqual({
      kind: 'warning',
      text: 'Over 5 weeks away, so Ada is now Inactive and won’t be billed for new terms.',
    });
  });

  it('says when a shorter absence becomes Inactive', () => {
    expect(
      markAwayToast(
        { firstName: 'Ada' },
        { date: '2026-09-30', today: '2026-10-07' }
      )
    ).toEqual({
      kind: 'success',
      text: 'Saved. Ada becomes Inactive on 4 Nov 2026 if the school hears nothing.',
    });
  });

  it('words back in school by state', () => {
    expect(backInSchoolToast({ firstName: 'Ada', life: 'inactive' })).toBe(
      'Ada is Active again and will be billed from the next charge run.'
    );
    expect(backInSchoolToast({ firstName: 'Ada', life: 'active' })).toBe(
      'Ada is marked as back in school.'
    );
  });
});

describe('move options', () => {
  const gold = {
    id: studentDetail().currentPlacement?.armId ?? '',
    name: 'JSS 1 Gold',
    campus: { id: IDS.lekki, name: 'Lekki' },
  };
  const emerald = {
    id: IDS.silver,
    name: 'JSS 1 Emerald',
    campus: { id: IDS.ikeja, name: 'Ikeja' },
  };

  it('labels a class with its campus', () => {
    expect(classOptionLabel(emerald)).toBe('JSS 1 Emerald · Ikeja');
  });

  it('defaults to the current class, else the first option', () => {
    expect(defaultMoveClass(studentDetail(), [emerald, gold])).toBe(gold.id);
    expect(defaultMoveClass(studentDetail(), [emerald])).toBe(emerald.id);
    expect(defaultMoveClass(studentDetail(), [])).toBe('');
  });

  it('flags a class outside the caller’s campuses', () => {
    expect(leavesScope(IDS.ikeja, [IDS.lekki])).toBe(true);
    expect(leavesScope(IDS.lekki, [IDS.lekki])).toBe(false);
    expect(leavesScope(IDS.ikeja, 'all')).toBe(false);
  });
});
