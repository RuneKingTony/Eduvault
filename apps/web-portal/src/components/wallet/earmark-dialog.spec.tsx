import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  walletEarmarkReleaseOverMessage,
  walletEarmarkSetOverMessage,
} from '@eduvault/api-contract';
import type { Permission } from '@eduvault/policy';
import { toast } from '@eduvault/ui';
import {
  ADA_ID,
  TOBI_ID,
  portalWallet,
  renderWithApi,
  walletChild,
} from '../../test-utils';
import { EarmarkDialog, type EarmarkKind } from './earmark-dialog';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const HELD: Permission[] = ['wallet:readOwn', 'wallet:spend'];

const wallet = portalWallet({
  freeMinor: 4_000_000,
  setAsideMinor: 1_000_000,
  children: [
    walletChild({
      studentId: ADA_ID,
      name: 'Ada Okeke',
      earmarkMinor: 1_000_000,
    }),
    walletChild({ studentId: TOBI_ID, name: 'Tobi Okeke', earmarkMinor: 0 }),
  ],
});

function setup(kind: EarmarkKind, studentId = ADA_ID) {
  const mutation = vi.fn().mockResolvedValue({ replayed: false, wallet });
  const api = {
    portalWallet: {
      setAside: kind === 'set' ? mutation : vi.fn(),
      release: kind === 'release' ? mutation : vi.fn(),
    },
  };
  const onClose = vi.fn();
  renderWithApi(
    <EarmarkDialog
      wallet={wallet}
      kind={kind}
      studentId={studentId}
      open
      onClose={onClose}
    />,
    api,
    HELD
  );
  return { mutation, onClose };
}

const amountField = () => screen.getByRole('textbox', { name: 'Amount (₦)' });

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  user = userEvent.setup();
  vi.clearAllMocks();
});

describe('EarmarkDialog set aside', () => {
  it('sets money aside for the chosen child with a reference, toasts and closes', async () => {
    const { mutation, onClose } = setup('set');
    const child = screen.getByRole('combobox', { name: 'Child' });
    expect(child).toHaveValue(ADA_ID);

    await user.selectOptions(child, TOBI_ID);
    await user.type(amountField(), '12,500');
    await user.click(screen.getByRole('button', { name: 'Set aside' }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(mutation).toHaveBeenCalledWith({
      body: {
        reference: expect.stringMatching(/^WSA-\d{8}-[A-Z2-7]{6}$/) as string,
        studentId: TOBI_ID,
        amountMinor: 1_250_000,
      },
    });
    expect(toast.success).toHaveBeenCalledWith(
      '₦12,500.00 set aside for Tobi Okeke.'
    );
  });

  it('refuses more than the free money without calling the API', async () => {
    const { mutation } = setup('set');
    await user.type(amountField(), '40000.01');
    await user.click(screen.getByRole('button', { name: 'Set aside' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      walletEarmarkSetOverMessage(4_000_000)
    );
    expect(mutation).not.toHaveBeenCalled();
  });

  it('refuses an empty amount', async () => {
    const { mutation } = setup('set');
    await user.click(screen.getByRole('button', { name: 'Set aside' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter an amount above zero.'
    );
    expect(mutation).not.toHaveBeenCalled();
  });
});

describe('EarmarkDialog release', () => {
  it('releases up to what is set aside for the child', async () => {
    const { mutation } = setup('release');
    await user.type(amountField(), '10000');
    await user.click(screen.getByRole('button', { name: 'Release' }));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        '₦10,000.00 released for Ada Okeke.'
      );
    });
    expect(mutation).toHaveBeenCalledWith({
      body: {
        reference: expect.stringMatching(/^WRL-\d{8}-[A-Z2-7]{6}$/) as string,
        studentId: ADA_ID,
        amountMinor: 1_000_000,
      },
    });
  });

  it('refuses more than is set aside for that child', async () => {
    const { mutation } = setup('release', TOBI_ID);
    await user.type(amountField(), '1');
    await user.click(screen.getByRole('button', { name: 'Release' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      walletEarmarkReleaseOverMessage(0)
    );
    expect(mutation).not.toHaveBeenCalled();
  });

  it('toasts the API’s refusal and stays open', async () => {
    const mutation = vi.fn().mockRejectedValue(new Error('The school is away'));
    const onClose = vi.fn();
    renderWithApi(
      <EarmarkDialog
        wallet={wallet}
        kind="release"
        studentId={ADA_ID}
        open
        onClose={onClose}
      />,
      { portalWallet: { release: mutation } },
      HELD
    );
    await user.type(amountField(), '10');
    await user.click(screen.getByRole('button', { name: 'Release' }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('The school is away');
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
