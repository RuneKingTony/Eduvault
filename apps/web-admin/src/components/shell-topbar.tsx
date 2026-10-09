import { MenuIcon, PanelLeftIcon, SearchIcon } from 'lucide-react';
import {
  AppTopbar,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Kbd,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSidebar,
} from '@eduvault/ui';

interface ShellTopbarProps {
  compact: boolean;
  groupLabel?: string;
  pageTitle: string;
  onOpenNavigation: () => void;
  onOpenSearch?: () => void;
}

function RailToggle() {
  const { open, toggleSidebar } = useSidebar();
  const label = `${open ? 'Collapse' : 'Expand'} sidebar ⌘B`;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Toggle sidebar"
            onClick={toggleSidebar}
          >
            <PanelLeftIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <Separator orientation="vertical" className="mx-1 h-4" />
    </>
  );
}

function Trail({
  compact,
  groupLabel,
  pageTitle,
}: Pick<ShellTopbarProps, 'compact' | 'groupLabel' | 'pageTitle'>) {
  return (
    <Breadcrumb aria-label="Breadcrumb">
      <BreadcrumbList className="flex-nowrap">
        {compact || groupLabel === undefined ? null : (
          <>
            <BreadcrumbItem>{groupLabel}</BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}
        <BreadcrumbItem>
          <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function ShellTopbar({
  compact,
  groupLabel,
  pageTitle,
  onOpenNavigation,
  onOpenSearch,
}: ShellTopbarProps) {
  return (
    <AppTopbar
      start={
        compact ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open navigation"
            onClick={onOpenNavigation}
          >
            <MenuIcon />
          </Button>
        ) : (
          <RailToggle />
        )
      }
      end={
        onOpenSearch === undefined ? undefined : (
          <Button
            variant="outline"
            size={compact ? 'icon-sm' : 'sm'}
            aria-label="Search pages and actions"
            onClick={onOpenSearch}
          >
            <SearchIcon />
            {compact ? null : (
              <>
                Search…
                <Kbd>⌘K</Kbd>
              </>
            )}
          </Button>
        )
      }
    >
      <Trail compact={compact} groupLabel={groupLabel} pageTitle={pageTitle} />
    </AppTopbar>
  );
}
