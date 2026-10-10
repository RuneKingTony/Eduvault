import { useQuery } from '@tanstack/react-query';
import { ErrorMessage, PageSkeleton } from '@eduvault/ui';
import { useApi } from '../api';
import { AboutSchoolForm } from '../components/about-school-form';
import { LogoRow } from '../components/logo-row';
import {
  SettingsHeader,
  SettingsRow,
  SettingsSection,
} from '../components/settings-page';
import { schoolProfileQueryOptions } from '../queries';

const CURRENCY_LABELS: Readonly<Record<string, string>> = {
  NGN: 'Naira (₦)',
};

export function SchoolProfilePage() {
  const api = useApi();
  const profile = useQuery(schoolProfileQueryOptions(api));
  if (profile.isError) {
    return <ErrorMessage error={profile.error} />;
  }
  if (profile.data === undefined) {
    return <PageSkeleton rows={3} />;
  }
  const school = profile.data;
  return (
    <section className="flex flex-col gap-4">
      <SettingsHeader
        title="School profile"
        description="Your school’s name, logo and contact details."
      />
      <SettingsSection
        title="Logo"
        description="Shown on receipts, charges and the parents’ portal."
      >
        <LogoRow profile={school} />
      </SettingsSection>
      <AboutSchoolForm profile={school} />
      <SettingsSection title="Money">
        <SettingsRow
          label="Currency"
          description="All fees, payments and receipts use Naira."
        >
          <span className="font-medium">
            {CURRENCY_LABELS[school.currency] ?? school.currency}
          </span>
        </SettingsRow>
      </SettingsSection>
    </section>
  );
}
