import { fireEvent, screen } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import { fakeAccess, renderWithApi, seedFeeSetup } from '../../test-utils';
import { currentYear } from '../../test-calendar';
import { NewYearDialog } from './new-year-dialog';

function setup(
  items = [currentYear()],
  create = vi.fn().mockResolvedValue({ ...currentYear(), madeCurrent: false })
) {
  const onOpenChange = vi.fn();
  const { queryClient } = renderWithApi(
    <NewYearDialog open onOpenChange={onOpenChange} />,
    {
      schoolYears: {
        list: vi.fn().mockResolvedValue({ items, total: items.length }),
        create,
      },
    },
    fakeAccess({ permissions: { session: ['create', 'read'] } })
  );
  return { create, onOpenChange, queryClient };
}

const field = (label: string) =>
  screen.findByLabelText<HTMLInputElement>(label);

describe('NewYearDialog', () => {
  it('suggests the year after the latest one', async () => {
    setup();
    expect(await field('Year')).toHaveValue('2027/2028');
    expect(await field('Starts')).toHaveValue('2027-09-06');
    expect(await field('Ends')).toHaveValue('2028-07-28');
    expect(
      screen.getByText('Two years in a row, for example 2028/2029.')
    ).toBeInTheDocument();
  });

  it('creates the year with the chosen dates and closes', async () => {
    const { create, onOpenChange } = setup();
    fireEvent.change(await field('Year'), { target: { value: '2028/2029' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create school year' }));
    await vi.waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        body: {
          name: '2028/2029',
          startsOn: '2027-09-06',
          endsOn: '2028-07-28',
        },
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it.each([
    { madeCurrent: true, dropped: true },
    { madeCurrent: false, dropped: false },
  ])(
    'drops the cached fee setup only when the new year made a term current (madeCurrent: $madeCurrent)',
    async ({ madeCurrent, dropped }) => {
      const create = vi
        .fn()
        .mockResolvedValue({ ...currentYear(), madeCurrent });
      const { onOpenChange, queryClient } = setup([currentYear()], create);
      const { key, setup: seeded } = seedFeeSetup(queryClient);
      await field('Year');
      fireEvent.click(
        screen.getByRole('button', { name: 'Create school year' })
      );
      await vi.waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
      expect(queryClient.getQueryData(key)).toEqual(
        dropped ? undefined : seeded
      );
    }
  );

  it('shows the API refusal inline and stays open', async () => {
    const create = vi.fn().mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message: 'Write the year as two years in a row, for example 2028/2029.',
      })
    );
    const { onOpenChange } = setup([currentYear()], create);
    fireEvent.change(await field('Year'), { target: { value: '27/28' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create school year' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Write the year as two years in a row, for example 2028/2029.'
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('asks for every field before calling the API', async () => {
    const { create } = setup();
    fireEvent.change(await field('Starts'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create school year' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Fill in the year and both dates.'
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('starts from the current year when the school has none', async () => {
    setup([]);
    expect(await field('Year')).toHaveValue(
      `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`
    );
  });
});
