import { render, screen } from '@testing-library/react';
import { ApiError } from '@eduvault/api-contract';
import {
  DetailCrumbs,
  DetailNotFound,
  DetailPage,
  detailState,
} from './detail-page';

const notFound = new ApiError(404, { code: 'NotFound', message: 'gone' });
const broken = new ApiError(500, { code: 'UnknownError', message: 'boom' });

describe('detailState', () => {
  it('lets a 404 win over data already cached', () => {
    expect(detailState({ data: 'cached', error: notFound })).toEqual({
      kind: 'not-found',
    });
  });

  it('keeps cached data when a refetch fails', () => {
    expect(detailState({ data: 'cached', error: broken })).toEqual({
      kind: 'ready',
      data: ['cached'],
    });
  });

  it('shows the error only when there is no data', () => {
    expect(detailState({ data: undefined, error: broken })).toEqual({
      kind: 'error',
      error: broken,
    });
  });

  it('is pending while nothing has loaded or failed', () => {
    expect(detailState({ data: undefined, error: null })).toEqual({
      kind: 'pending',
    });
  });

  it('waits for every query and reports the first failure among them', () => {
    expect(
      detailState({ data: 'a', error: null }, { data: undefined, error: null })
    ).toEqual({ kind: 'pending' });
    expect(
      detailState(
        { data: 'a', error: null },
        { data: undefined, error: broken }
      )
    ).toEqual({ kind: 'error', error: broken });
    expect(
      detailState({ data: 'a', error: null }, { data: 'b', error: broken })
    ).toEqual({ kind: 'ready', data: ['a', 'b'] });
  });

  it('counts only the first query’s 404', () => {
    expect(
      detailState(
        { data: 'a', error: null },
        { data: undefined, error: notFound }
      )
    ).toEqual({ kind: 'error', error: notFound });
  });
});

describe('DetailPage', () => {
  const page = (query: { data: string | undefined; error: Error | null }) =>
    render(
      <DetailPage queries={[query]} notFound={<p>No such row</p>}>
        {([value]) => <p>Loaded {value}</p>}
      </DetailPage>
    );

  it('renders the not-found slot, the data, the error alert or the skeleton', () => {
    const { unmount } = page({ data: undefined, error: notFound });
    expect(screen.getByText('No such row')).toBeVisible();
    unmount();

    const second = page({ data: 'ok', error: broken });
    expect(screen.getByText('Loaded ok')).toBeVisible();
    second.unmount();

    const third = page({ data: undefined, error: broken });
    expect(screen.getByRole('alert')).toBeVisible();
    third.unmount();

    page({ data: undefined, error: null });
    expect(screen.queryByText('Loaded ok')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('DetailNotFound', () => {
  it('stands alone without a heading and carries the default reach note', () => {
    render(<DetailNotFound title="No receipt here" />);
    expect(screen.getByText('No receipt here')).toBeVisible();
    expect(
      screen.getByText(/belong to a campus you don’t look after/)
    ).toBeVisible();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('sits under crumbs and a heading when given one', () => {
    render(
      <DetailNotFound
        heading="Not found"
        crumbs={<p>crumbs</p>}
        title="No charge here"
        back={<button type="button">Back</button>}
      />
    );
    expect(screen.getByRole('heading', { name: 'Not found' })).toBeVisible();
    expect(screen.getByText('crumbs')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back' })).toBeVisible();
  });
});

describe('DetailCrumbs', () => {
  it('shows an optional section, the way back and the current page', () => {
    render(
      <DetailCrumbs
        section="People"
        parent={<button type="button">Staff and members</button>}
        last="Ada"
      />
    );
    expect(screen.getByText('People')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Staff and members' })
    ).toBeVisible();
    expect(screen.getByText('Ada')).toHaveAttribute('aria-current', 'page');
  });
});
