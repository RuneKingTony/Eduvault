import { useRouter } from '@tanstack/react-router';
import { Button, setThemeChoice, useThemeChoice } from '@eduvault/ui';
import { MoneySection } from '../components/dev-ui/money-section';
import { NavSection } from '../components/dev-ui/nav-section';
import { ShellSection } from '../components/dev-ui/shell-section';
import {
  TokensSection,
  TypeSection,
} from '../components/dev-ui/tokens-section';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function DevUiPage() {
  const router = useRouter();
  const { resolved } = useThemeChoice();
  const builtRoutes = new Set(Object.keys(router.routesByPath));
  return (
    <div className="flex flex-col gap-8" data-theme-mode={resolved}>
      <div className="flex items-center justify-between gap-3">
        <h1>Component gallery</h1>
        <Button
          variant="outline"
          onClick={() => {
            setThemeChoice(resolved === 'dark' ? 'light' : 'dark');
          }}
        >
          Switch to {resolved === 'dark' ? 'light' : 'dark'}
        </Button>
      </div>
      <Section title="Tokens">
        <TokensSection />
      </Section>
      <Section title="Type scale">
        <TypeSection />
      </Section>
      <Section title="Money colours and contrast">
        <MoneySection />
      </Section>
      <Section title="Navigation model">
        <NavSection builtRoutes={builtRoutes} />
      </Section>
      <Section title="Shell pieces">
        <ShellSection />
      </Section>
    </div>
  );
}
