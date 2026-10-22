import { toast } from '@eduvault/ui';
import type { Api } from '../api';
import { announceReplay, uploadProofOnce } from './record-once';

const proof = () => new File(['pdf'], 'slip.pdf', { type: 'application/pdf' });

function fakeApi() {
  const upload = vi.fn().mockResolvedValue({ id: 'file-1' });
  return { api: { files: { upload } } as unknown as Api, upload };
}

describe('uploadProofOnce', () => {
  it('uploads the file as a payment proof and remembers what it stored', async () => {
    const { api, upload } = fakeApi();
    const file = proof();
    const remember = vi.fn();

    const id = await uploadProofOnce(api, {
      file,
      needed: true,
      uploaded: undefined,
      remember,
    });

    expect(id).toBe('file-1');
    expect(upload).toHaveBeenCalledTimes(1);
    const body = (upload.mock.calls[0]?.[0] as { body: FormData }).body;
    expect(body.get('kind')).toBe('payment_proof');
    expect(body.get('file')).toBe(file);
    expect(remember).toHaveBeenCalledWith({ file, id: 'file-1' });
  });

  it('reuses the stored id when a retry sends the same file', async () => {
    const { api, upload } = fakeApi();
    const file = proof();

    const id = await uploadProofOnce(api, {
      file,
      needed: true,
      uploaded: { file, id: 'file-0' },
      remember: vi.fn(),
    });

    expect(id).toBe('file-0');
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads again when the file was replaced', async () => {
    const { api, upload } = fakeApi();

    await uploadProofOnce(api, {
      file: proof(),
      needed: true,
      uploaded: { file: proof(), id: 'file-0' },
      remember: vi.fn(),
    });

    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('uploads nothing when the method needs no proof or there is no file', async () => {
    const { api, upload } = fakeApi();
    const remember = vi.fn();

    expect(
      await uploadProofOnce(api, {
        file: proof(),
        needed: false,
        uploaded: undefined,
        remember,
      })
    ).toBeUndefined();
    expect(
      await uploadProofOnce(api, {
        file: undefined,
        needed: true,
        uploaded: undefined,
        remember,
      })
    ).toBeUndefined();
    expect(upload).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
  });
});

describe('announceReplay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns with the caller’s copy and says it was a replay', () => {
    const warning = vi.spyOn(toast, 'warning').mockReturnValue('id');

    const replayed = announceReplay(
      { replayed: true, reference: 'REF-1' },
      (result) => `Already recorded ${result.reference}`
    );

    expect(replayed).toBe(true);
    expect(warning).toHaveBeenCalledWith('Already recorded REF-1');
  });

  it('stays silent for a first recording', () => {
    const warning = vi.spyOn(toast, 'warning').mockReturnValue('id');

    const replayed = announceReplay({ replayed: false }, () => 'never shown');

    expect(replayed).toBe(false);
    expect(warning).not.toHaveBeenCalled();
  });
});
