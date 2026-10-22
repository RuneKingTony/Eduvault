import type { ReactNode } from 'react';
import { ApiError } from '@eduvault/api-contract';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  ErrorMessage,
  NotFoundState,
  PageSkeleton,
} from '@eduvault/ui';

interface QueryGate {
  data: unknown;
  error: Error | null;
}

type Loaded<Q extends QueryGate> = Exclude<Q['data'], undefined>;

type LoadedData<Qs extends readonly QueryGate[]> = {
  -readonly [K in keyof Qs]: Qs[K] extends QueryGate ? Loaded<Qs[K]> : never;
};

type DetailState<Qs extends readonly QueryGate[]> =
  | { kind: 'not-found' }
  | { kind: 'ready'; data: LoadedData<Qs> }
  | { kind: 'error'; error: Error }
  | { kind: 'pending' };

/**
 * What a detail page shows. A 404 on the first query always wins, so an
 * out-of-scope row never lingers from the cache; otherwise data already
 * loaded stays on screen even when a refetch fails; only without it do the
 * error or the skeleton show.
 */
export function detailState<
  const Qs extends readonly [QueryGate, ...QueryGate[]],
>(...queries: Qs): DetailState<Qs> {
  const [main] = queries;
  if (main.error instanceof ApiError && main.error.status === 404) {
    return { kind: 'not-found' };
  }
  if (queries.every((query) => query.data !== undefined)) {
    return {
      kind: 'ready',
      data: queries.map((query) => query.data) as LoadedData<Qs>,
    };
  }
  const failed = queries.find((query) => query.error !== null);
  return failed?.error
    ? { kind: 'error', error: failed.error }
    : { kind: 'pending' };
}

interface DetailPageProps<Qs extends readonly [QueryGate, ...QueryGate[]]> {
  queries: Qs;
  notFound: ReactNode;
  rows?: number;
  children: (data: LoadedData<Qs>) => ReactNode;
}

export function DetailPage<Qs extends readonly [QueryGate, ...QueryGate[]]>({
  queries,
  notFound,
  rows = 2,
  children,
}: DetailPageProps<Qs>) {
  const state = detailState(...queries);
  switch (state.kind) {
    case 'not-found': {
      return <>{notFound}</>;
    }
    case 'error': {
      return <ErrorMessage error={state.error} />;
    }
    case 'pending': {
      return <PageSkeleton rows={rows} />;
    }
    case 'ready': {
      return <>{children(state.data)}</>;
    }
  }
}

const NOT_IN_REACH =
  'It may have been moved, or it may belong to a campus you don’t look after.';

interface DetailNotFoundProps {
  /** With a heading the state sits in a page section under any crumbs. */
  heading?: string;
  crumbs?: ReactNode;
  title: string;
  description?: string;
  back?: ReactNode;
}

export function DetailNotFound({
  heading,
  crumbs,
  title,
  description = NOT_IN_REACH,
  back,
}: DetailNotFoundProps) {
  const state = (
    <NotFoundState title={title} description={description}>
      {back}
    </NotFoundState>
  );
  if (heading === undefined) {
    return state;
  }
  return (
    <section className="flex flex-col gap-4">
      {crumbs}
      <h1>{heading}</h1>
      {state}
    </section>
  );
}

export function BackButton({
  label,
  onBack,
  size,
  variant = 'outline',
}: {
  label: string;
  onBack: () => void;
  size?: 'sm';
  variant?: 'outline' | 'default';
}) {
  return (
    <Button
      type="button"
      variant={variant}
      {...(size === undefined ? {} : { size })}
      onClick={onBack}
    >
      {label}
    </Button>
  );
}

interface DetailCrumbsProps {
  /** The way back, a button or link rendered inside the breadcrumb link. */
  parent: ReactNode;
  last: string;
  /** A plain group name before the parent, such as People. */
  section?: string;
}

export function DetailCrumbs({ parent, last, section }: DetailCrumbsProps) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {section === undefined ? null : (
          <>
            <BreadcrumbItem>{section}</BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}
        <BreadcrumbItem>
          <BreadcrumbLink asChild>{parent}</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{last}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
