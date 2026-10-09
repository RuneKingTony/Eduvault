import { NavIcon } from '@eduvault/ui';
import { NAV_GROUPS, SETTINGS_SECTIONS } from '../../nav';

export function NavSection({
  builtRoutes,
}: {
  builtRoutes: ReadonlySet<string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.id}>
          <h3 className="mb-1">
            {group.label ?? 'Settings (unlabelled, bottom)'}
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {group.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <NavIcon name={item.icon} className="size-4" />
                <span className="font-medium">{item.label}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {item.route}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {builtRoutes.has(item.route) ? 'Built' : 'Not built yet'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        Settings sections:{' '}
        {SETTINGS_SECTIONS.map((section) => section.label).join(', ')}
      </p>
    </div>
  );
}
