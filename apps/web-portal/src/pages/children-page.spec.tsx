import { fireEvent, screen } from '@testing-library/react';
import { portalChild, portalMe, renderWithApi } from '../test-utils';
import { ChildrenPage } from './children-page';

const ada = portalChild({ id: 'ada', firstName: 'Ada' });
const tobi = portalChild({
  id: 'tobi',
  firstName: 'Tobi',
  className: null,
  campusName: 'Ikeja',
});
const efe = portalChild({
  id: 'efe',
  firstName: 'Efe',
  campusName: 'Lekki',
  archived: true,
});

const apiWith = (children: ReturnType<typeof portalChild>[]) => ({
  portal: { children: vi.fn().mockResolvedValue(children) },
});

describe('ChildrenPage', () => {
  it('greets the guardian and counts the children at the school', async () => {
    renderWithApi(
      <ChildrenPage me={portalMe()} onOpenChild={vi.fn()} />,
      apiWith([ada, tobi])
    );
    expect(
      await screen.findByRole('heading', { name: 'Hello, Ngozi' })
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 children at Greenfield College.')
    ).toBeInTheDocument();
  });

  it('uses the singular for one child', async () => {
    renderWithApi(
      <ChildrenPage me={portalMe()} onOpenChild={vi.fn()} />,
      apiWith([ada])
    );
    expect(
      await screen.findByText('1 child at Greenfield College.')
    ).toBeInTheDocument();
  });

  it('shows a card per child with class and campus, a dash when unplaced, and archived', async () => {
    renderWithApi(
      <ChildrenPage me={portalMe()} onOpenChild={vi.fn()} />,
      apiWith([ada, tobi, efe])
    );
    expect(
      await screen.findByRole('button', {
        name: 'Ada Okeke JSS 1 Gold · Lekki',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tobi Okeke — · Ikeja' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Efe Okeke JSS 1 Gold · Lekki · archived',
      })
    ).toBeInTheDocument();
  });

  it('opens Home for the chosen child', async () => {
    const onOpenChild = vi.fn();
    renderWithApi(
      <ChildrenPage me={portalMe()} onOpenChild={onOpenChild} />,
      apiWith([ada, tobi])
    );
    fireEvent.click(await screen.findByRole('button', { name: /Tobi Okeke/ }));
    expect(onOpenChild).toHaveBeenCalledWith('tobi');
  });

  it('says so when no children are linked', async () => {
    renderWithApi(
      <ChildrenPage me={portalMe()} onOpenChild={vi.fn()} />,
      apiWith([])
    );
    expect(await screen.findByText('No children linked')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Your login still works. Ask the school office to link your children.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('0 children at Greenfield College.')).toBeVisible();
  });

  it('shows a skeleton while loading', () => {
    renderWithApi(<ChildrenPage me={portalMe()} onOpenChild={vi.fn()} />, {
      portal: {
        children: vi.fn().mockReturnValue(new Promise(() => undefined)),
      },
    });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it('shows the error when the children cannot be loaded', async () => {
    renderWithApi(<ChildrenPage me={portalMe()} onOpenChild={vi.fn()} />, {
      portal: {
        children: vi.fn().mockRejectedValue(new Error('The school is away')),
      },
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The school is away'
    );
  });
});
