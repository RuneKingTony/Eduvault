import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

export function TablePager({
  page,
  hasNext,
  onPrevious,
  onNext,
  className,
}: {
  page: number;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}) {
  return (
    <nav
      aria-label="Table pages"
      className={cn('flex items-center justify-end gap-2', className)}
    >
      <span className="text-sm text-muted-foreground">Page {page}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={onPrevious}
      >
        Previous
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasNext}
        onClick={onNext}
      >
        Next
      </Button>
    </nav>
  );
}
