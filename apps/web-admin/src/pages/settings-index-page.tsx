import { ChevronRightIcon } from 'lucide-react';
import { NavIcon } from '@eduvault/ui';
import { SettingsHeader, SettingsSection } from '../components/settings-page';
import type { SettingsSection as Item } from '../nav';

export function SettingsIndexPage({
  items,
  onOpen,
}: {
  items: readonly Item[];
  onOpen: (route: string) => void;
}) {
  return (
    <section className="flex flex-col gap-4">
      <SettingsHeader
        title="Settings"
        description="The parts of the school set-up you can open."
      />
      <SettingsSection title="Your settings">
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 py-3 text-left hover:text-primary"
                onClick={() => {
                  onOpen(item.route);
                }}
              >
                <NavIcon name={item.icon} className="size-4" />
                <span className="flex-1">{item.label}</span>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </section>
  );
}
