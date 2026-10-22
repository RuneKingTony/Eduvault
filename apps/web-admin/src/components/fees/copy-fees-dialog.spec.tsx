import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { copySource, feesApi, TERM_1 } from '../../test-fees';
import { renderWithApi } from '../../test-utils';
import { CopyFeesDialog } from './copy-fees-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup() {
  const api = feesApi();
  const onOpenChange = vi.fn();
  const { sourceTerm } = copySource();
  if (sourceTerm === null) {
    throw new Error('The fixture has a source term');
  }
  renderWithApi(
    <CopyFeesDialog
      open
      source={sourceTerm}
      count={12}
      target={{ id: TERM_1, label: 'First term, 2026/2027' }}
      onOpenChange={onOpenChange}
    />,
    api
  );
  return { api, onOpenChange };
}

describe('CopyFeesDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('names the source, the target and how many fees it copies', async () => {
    setup();
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Copy fees from Third term, 2025/2026?')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Into First term, 2026/2027.')
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Copies the 12 active fees of Third term, 2025/2026, with the same amounts, campuses and rules. Retired fees stay behind. Change any amount afterwards.'
      )
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('Charges already sent don’t change.')
    ).toBeInTheDocument();
  });

  it('copies into the target term, then toasts and closes', async () => {
    const user = userEvent.setup();
    const { api, onOpenChange } = setup();
    await user.click(await screen.findByRole('button', { name: 'Copy fees' }));
    await waitFor(() => {
      expect(api.feeLines.copy).toHaveBeenCalledWith({
        body: { termId: TERM_1 },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Copied 12 fees from Third term, 2025/2026. They apply from the next round of charges.'
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes without copying on Cancel', async () => {
    const user = userEvent.setup();
    const { api, onOpenChange } = setup();
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.feeLines.copy).not.toHaveBeenCalled();
  });

  it('toasts the refusal from the server and stays open', async () => {
    const user = userEvent.setup();
    const { api, onOpenChange } = setup();
    api.feeLines.copy.mockRejectedValue(
      new ApiError(409, {
        code: 'Conflict',
        message:
          'First term, 2026/2027 already has fees. Change them one at a time instead.',
      })
    );
    await user.click(await screen.findByRole('button', { name: 'Copy fees' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'First term, 2026/2027 already has fees. Change them one at a time instead.'
      );
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
