import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from '@eduvault/ui';
import { newDraft, type GuardianDraftState } from '../guardian-draft';
import { renderWithApi } from '../test-utils';
import { GuardianPicker, optionLabel } from './guardian-picker';
import { PhotoField, photoProblem } from './photo-field';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const GUARDIANS = [
  {
    id: 'g1',
    fullName: 'Ngozi Okeke',
    phone: '0803 456 7890',
    childFirstNames: ['Ada', 'Chidi'],
    outsideScope: false,
  },
  {
    id: 'g2',
    fullName: 'Bayo Adewale',
    phone: '0807 890 1234',
    outsideScope: false,
  },
];

function Harness({
  start,
  canCreate = true,
  taken = [],
}: {
  start: GuardianDraftState;
  canCreate?: boolean;
  taken?: string[];
}) {
  const [draft, setDraft] = useState(start);
  return (
    <GuardianPicker
      idPrefix="test"
      draft={draft}
      studentId="st-1"
      takenIds={taken}
      canCreate={canCreate}
      errors={{}}
      onChange={(patch) => {
        setDraft({ ...draft, ...patch });
      }}
    />
  );
}

const existing = () =>
  newDraft(1, { mode: 'existing', relationship: 'father', paysFees: false });
const fresh = () =>
  newDraft(1, { mode: 'new', relationship: 'mother', paysFees: true });

function setup(node: React.ReactElement, list = GUARDIANS) {
  const api = {
    guardians: {
      list: vi.fn().mockResolvedValue(list),
    },
    files: { upload: vi.fn().mockResolvedValue({ id: 'file-1' }) },
  };
  renderWithApi(node, api);
  return api;
}

describe('optionLabel', () => {
  it('joins name, phone and the children, and hides the rest for another campus', () => {
    expect(optionLabel(GUARDIANS[0]!)).toBe(
      'Ngozi Okeke · 0803 456 7890 · Ada, Chidi'
    );
    expect(optionLabel(GUARDIANS[1]!)).toBe('Bayo Adewale · 0807 890 1234');
    expect(
      optionLabel({ id: 'g3', fullName: 'Ifeanyi Okeke', outsideScope: true })
    ).toBe('Ifeanyi Okeke (another campus)');
  });
});

describe('GuardianPicker existing mode', () => {
  it('lists the guardians, hides the ones chosen elsewhere and keeps the hint', async () => {
    setup(<Harness start={existing()} taken={['g2']} />);
    expect(
      await screen.findByRole('option', {
        name: 'Ngozi Okeke · 0803 456 7890 · Ada, Chidi',
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Bayo Adewale/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Their login stays the same. This child appears in their portal.'
      )
    ).toBeInTheDocument();
  });

  it('says every guardian is already linked when none is left', async () => {
    setup(<Harness start={existing()} />, []);
    expect(
      await screen.findByText(
        /Every guardian in the school is already linked to this child/
      )
    ).toBeInTheDocument();
  });

  it('finds a guardian by an exact phone or email once four characters are typed', async () => {
    const api = setup(<Harness start={existing()} />);
    await screen.findByLabelText('Guardian');
    api.guardians.list.mockClear();
    fireEvent.change(screen.getByLabelText('Or find by exact phone or email'), {
      target: { value: '0803' },
    });
    await waitFor(() => {
      expect(api.guardians.list).toHaveBeenCalledWith({
        query: { q: '0803', excludeStudentId: 'st-1' },
      });
    });
  });

  it('clears the chosen guardian when the mode switches', async () => {
    setup(<Harness start={existing()} />);
    fireEvent.change(await screen.findByLabelText('Guardian'), {
      target: { value: 'g1' },
    });
    expect(screen.getByLabelText('Guardian')).toHaveValue('g1');
    fireEvent.click(screen.getByLabelText('New guardian'));
    fireEvent.click(await screen.findByLabelText('Existing guardian'));
    expect(await screen.findByLabelText('Guardian')).toHaveValue('');
  });
});

describe('GuardianPicker new mode', () => {
  it('shows the email field for the email login and a username preview for the username login', async () => {
    setup(<Harness start={fresh()} />);
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Mrs Udoh' },
    });
    fireEvent.click(screen.getByLabelText(/With a username/));
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    expect(screen.getByText('udoh-family')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/With their email/));
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('disables New guardian without guardian:create', async () => {
    setup(<Harness start={existing()} canCreate={false} />);
    expect(await screen.findByLabelText('New guardian')).toBeDisabled();
  });

  it('ticks and unticks Pays the school fees', async () => {
    setup(<Harness start={fresh()} />);
    const box = await screen.findByLabelText(
      'Pays the school fees (receives the charges)'
    );
    expect(box).toBeChecked();
    fireEvent.click(box);
    expect(box).not.toBeChecked();
  });
});

describe('photoProblem', () => {
  it('accepts PNG, JPEG and WebP up to 1 MB and names the refusals', () => {
    expect(photoProblem({ type: 'image/png', size: 1000 })).toBeNull();
    expect(photoProblem({ type: 'image/jpeg', size: 1_048_576 })).toBeNull();
    expect(photoProblem({ type: 'image/webp', size: 5 })).toBeNull();
    expect(photoProblem({ type: 'image/gif', size: 5 })).toBe(
      'Choose a PNG, JPG or WebP photo.'
    );
    expect(photoProblem({ type: 'image/png', size: 1_048_577 })).toBe(
      'That photo is over 1 MB. Please choose a smaller one.'
    );
  });
});

const choose = (file: File) => {
  fireEvent.change(screen.getByLabelText('Photo file'), {
    target: { files: [file] },
  });
};

describe('PhotoField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:preview' });
  });

  it('toasts the PRD copy for the wrong type and an oversized file and uploads nothing', () => {
    const onChange = vi.fn();
    const api = setup(
      <PhotoField
        name=""
        value={{ fileId: null, preview: null }}
        onChange={onChange}
      />
    );
    choose(new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(toast.error).toHaveBeenCalledWith(
      'Choose a PNG, JPG or WebP photo.'
    );
    choose(
      new File([new Uint8Array(1_048_577)], 'a.png', { type: 'image/png' })
    );
    expect(toast.error).toHaveBeenCalledWith(
      'That photo is over 1 MB. Please choose a smaller one.'
    );
    expect(api.files.upload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uploads a good photo as a guardian_photo and reports the file id', async () => {
    const onChange = vi.fn();
    const api = setup(
      <PhotoField
        name="Ngozi"
        value={{ fileId: null, preview: null }}
        onChange={onChange}
      />
    );
    choose(new File(['x'], 'a.png', { type: 'image/png' }));
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        fileId: 'file-1',
        preview: 'blob:preview',
      });
    });
    const body = api.files.upload.mock.calls[0]?.[0].body as FormData;
    expect(body.get('kind')).toBe('guardian_photo');
  });

  it('offers Change photo and Remove once a photo is chosen', () => {
    const onChange = vi.fn();
    setup(
      <PhotoField
        name="Ngozi"
        value={{ fileId: 'f', preview: 'blob:p' }}
        onChange={onChange}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Change photo' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onChange).toHaveBeenCalledWith({ fileId: null, preview: null });
  });
});
