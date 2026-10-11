import {
  draftErrors,
  draftsProblem,
  hasErrors,
  loginNote,
  newDraft,
  toDraftInput,
  usernamePreview,
  withPayer,
  type GuardianDraftState,
} from './guardian-draft';

const fresh = (overrides: Partial<GuardianDraftState> = {}) => ({
  ...newDraft(1, { mode: 'new', relationship: 'mother', paysFees: false }),
  fullName: ' Ngozi Okeke ',
  phone: '08012345678',
  address: '4 Palm Close',
  email: 'ngozi@example.com',
  ...overrides,
});

describe('draftErrors', () => {
  it('is empty for a complete new guardian and for an existing one', () => {
    expect(draftErrors(fresh())).toEqual({});
    expect(
      draftErrors(
        newDraft(2, {
          mode: 'existing',
          relationship: 'father',
          paysFees: false,
        })
      )
    ).toEqual({});
  });

  it('uses the contract copy for each missing field and a bad email', () => {
    const errors = draftErrors(
      fresh({ fullName: ' ', phone: '12', address: '', email: 'nope' })
    );
    expect(errors).toEqual({
      fullName: 'Enter the guardian’s full name.',
      phone: 'Enter a phone number.',
      address: 'Enter the house address.',
      email: 'Enter a valid email.',
    });
    expect(hasErrors(errors)).toBe(true);
  });

  it('does not ask for an email with the username login', () => {
    expect(draftErrors(fresh({ loginKind: 'username', email: '' }))).toEqual(
      {}
    );
  });
});

describe('toDraftInput', () => {
  it('builds the existing and the new guardian bodies', () => {
    expect(
      toDraftInput(
        newDraft(2, {
          mode: 'existing',
          relationship: 'father',
          paysFees: true,
        })
      )
    ).toEqual({
      existingGuardianId: '',
      relationship: 'father',
      paysFees: true,
    });
    expect(toDraftInput(fresh({ photoFileId: 'file-1' }))).toEqual({
      new: {
        fullName: ' Ngozi Okeke ',
        phone: '08012345678',
        address: '4 Palm Close',
        relationship: 'mother',
        paysFees: false,
        photoFileId: 'file-1',
        login: { kind: 'email', email: 'ngozi@example.com' },
      },
    });
  });
});

const existing = (key: number, existingId: string) => ({
  ...newDraft(key, {
    mode: 'existing',
    relationship: 'father',
    paysFees: false,
  }),
  existingId,
});

describe('draftsProblem', () => {
  it('asks for a choice first, then refuses the same guardian twice', () => {
    expect(draftsProblem([existing(1, '')])).toBe(
      'Choose the existing guardian, or switch to New guardian.'
    );
    expect(draftsProblem([existing(1, 'g'), existing(2, 'g')])).toBe(
      'The same guardian is chosen twice.'
    );
    expect(draftsProblem([fresh(), existing(2, 'g')])).toBeUndefined();
  });
});

describe('withPayer', () => {
  it('makes Guardian 1 pay when nobody does and leaves a ticked payer alone', () => {
    expect(
      withPayer([fresh(), fresh({ key: 2 })]).map((d) => d.paysFees)
    ).toEqual([true, false]);
    expect(
      withPayer([fresh(), fresh({ key: 2, paysFees: true })]).map(
        (d) => d.paysFees
      )
    ).toEqual([false, true]);
    expect(withPayer([])).toEqual([]);
  });
});

describe('login notes', () => {
  it('describes each login kind', () => {
    expect(loginNote(fresh())).toBe(
      'Signs in with ngozi@example.com and a temporary password.'
    );
    expect(
      loginNote(fresh({ loginKind: 'username', fullName: 'Mrs Udoh' }))
    ).toBe('Username udoh-family with a temporary password.');
    expect(
      loginNote(
        newDraft(2, {
          mode: 'existing',
          relationship: 'father',
          paysFees: false,
        })
      )
    ).toBe('Existing guardian. Keeps their current login.');
    expect(usernamePreview(fresh({ fullName: '' }))).toBe('guardian-family');
  });
});
