import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type CreateSchoolYearInput } from '@eduvault/api-contract';
import { fakeAccess, renderWithApi, seedFeeSetup } from '../../test-utils';
import { currentYear, nextYear } from '../../test-calendar';
import { NewYearDialog } from './new-year-dialog';

const created = (madeCurrent: boolean) =>
  vi.fn(({ body }: { body: CreateSchoolYearInput }) => ({
    ...nextYear(body),
    madeCurrent,
  }));

function setup(items = [currentYear()], create = created(false)) {
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
    const user = userEvent.setup();
    const { create, onOpenChange } = setup();
    const year = await field('Year');
    await user.clear(year);
    await user.type(year, '2028/2029');
    await user.click(
      screen.getByRole('button', { name: 'Create school year' })
    );
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
      const user = userEvent.setup();
      const { onOpenChange, queryClient } = setup(
        [currentYear()],
        created(madeCurrent)
      );
      const { key, setup: seeded } = seedFeeSetup(queryClient);
      await field('Year');
      await user.click(
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
    const user = userEvent.setup();
    const create = vi.fn().mockRejectedValue(
      new ApiError(400, {
        code: 'BadRequest',
        message: 'Write the year as two years in a row, for example 2028/2029.',
      })
    );
    const { onOpenChange } = setup([currentYear()], create);
    const year = await field('Year');
    await user.clear(year);
    await user.type(year, '27/28');
    await user.click(
      screen.getByRole('button', { name: 'Create school year' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Write the year as two years in a row, for example 2028/2029.'
    );
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('asks for every field before calling the API', async () => {
    const user = userEvent.setup();
    const { create } = setup();
    await user.clear(await field('Starts'));
    await user.click(
      screen.getByRole('button', { name: 'Create school year' })
    );
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
