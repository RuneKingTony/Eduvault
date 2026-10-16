import { FeesScreen } from '../components/fees/fees-screen';
import type { FeesSearch } from '../fees-search';

export function SchoolFeesPage({
  search,
  onSearchChange,
}: {
  search: FeesSearch;
  onSearchChange: (next: FeesSearch) => void;
}) {
  return (
    <FeesScreen
      group="school"
      search={search}
      onSearchChange={onSearchChange}
    />
  );
}
