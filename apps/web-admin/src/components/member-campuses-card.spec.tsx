import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { renderWithApi } from '../test-utils';
import { IKEJA, LEKKI, detail } from '../test-members';
import { MemberCampusesCard } from './member-campuses-card';

vi.mock('@eduvault/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@eduvault/ui')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setup({
  campusIds = [LEKKI.id],
  canEdit = true,
  updateCampuses = vi.fn().mockResolvedValue(detail()),
}: {
  campusIds?: string[];
  canEdit?: boolean;
  updateCampuses?: ReturnType<typeof vi.fn>;
} = {}) {
  renderWithApi(
    <MemberCampusesCard
      member={detail({ campusIds })}
      campuses={[LEKKI, IKEJA]}
      canEdit={canEdit}
      isSelf={false}
    />,
    { members: { updateCampuses } }
  );
  return { updateCampuses };
}

const campusSwitch = (name: string) => screen.getByRole('switch', { name });

describe('MemberCampusesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables the switch on the member’s only campus', () => {
    setup();
    expect(campusSwitch('Lekki')).toBeChecked();
    expect(campusSwitch('Lekki')).toBeDisabled();
    expect(campusSwitch('Ikeja')).not.toBeChecked();
    expect(campusSwitch('Ikeja')).toBeEnabled();
  });

  it('lets a campus go while another remains', () => {
    setup({ campusIds: [LEKKI.id, IKEJA.id] });
    expect(campusSwitch('Lekki')).toBeEnabled();
    expect(campusSwitch('Ikeja')).toBeEnabled();
  });

  it('adds a campus and says so', async () => {
    const { updateCampuses } = setup();
    fireEvent.click(campusSwitch('Ikeja'));
    await waitFor(() => {
      expect(updateCampuses).toHaveBeenCalledWith({
        params: { id: detail().id },
        body: { campusIds: [LEKKI.id, IKEJA.id] },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Ada Obi added to Ikeja.');
    });
  });

  it('removes a campus and says so', async () => {
    const { updateCampuses } = setup({ campusIds: [LEKKI.id, IKEJA.id] });
    fireEvent.click(campusSwitch('Ikeja'));
    await waitFor(() => {
      expect(updateCampuses).toHaveBeenCalledWith({
        params: { id: detail().id },
        body: { campusIds: [LEKKI.id] },
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Ada Obi removed from Ikeja.');
    });
  });

  it('shows the server’s refusal', async () => {
    setup({
      updateCampuses: vi
        .fn()
        .mockRejectedValue(
          new ApiError(404, { code: 'NotFound', message: 'Campus not found' })
        ),
    });
    fireEvent.click(campusSwitch('Ikeja'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Campus not found');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('is read-only without member:update', () => {
    setup({ campusIds: [LEKKI.id, IKEJA.id], canEdit: false });
    expect(campusSwitch('Lekki')).toBeDisabled();
    expect(campusSwitch('Ikeja')).toBeDisabled();
  });
});
