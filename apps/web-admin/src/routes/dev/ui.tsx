import { Suspense, lazy } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { NotFoundPage } from '../../components/page-fallbacks';
import { isDev } from '../../env';

const Gallery = isDev
  ? lazy(() =>
      import('../../pages/dev-ui-page').then((module) => ({
        default: module.DevUiPage,
      }))
    )
  : null;

function DevUi() {
  return Gallery === null ? (
    <NotFoundPage />
  ) : (
    <Suspense>
      <Gallery />
    </Suspense>
  );
}

export const Route = createFileRoute('/dev/ui')({
  component: DevUi,
});
