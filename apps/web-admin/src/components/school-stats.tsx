import type { PlatformSchoolList } from '@eduvault/api-contract';
import { Card, CardContent } from '@eduvault/ui';

function Stat({
  label,
  value,
  subline,
}: {
  label: string;
  value: number;
  subline: string;
}) {
  return (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{subline}</span>
    </>
  );
}

export function SchoolStats({
  totals,
  onOpenAudit,
}: {
  totals: PlatformSchoolList['totals'] | undefined;
  onOpenAudit: () => void;
}) {
  if (totals === undefined) {
    return null;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card>
        <CardContent className="flex flex-col">
          <Stat
            label="Schools"
            value={totals.schools}
            subline={`${totals.active} active`}
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col">
          <Stat
            label="Students"
            value={totals.students}
            subline="Across every school"
          />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <button
            type="button"
            onClick={onOpenAudit}
            className="flex w-full flex-col text-left"
            aria-label="Acting requests, open the audit log"
          >
            <Stat
              label="Acting requests"
              value={totals.actingRequests}
              subline="All audited"
            />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
