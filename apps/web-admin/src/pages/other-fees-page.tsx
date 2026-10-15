import { FeesScreen } from '../components/fees/fees-screen';
import type { FeesSearch } from '../fees-search';

export function OtherFeesPage({
  search,
  onSearchChange,
}: {
  search: FeesSearch;
  onSearchChange: (next: FeesSearch) => void;
}) {
  return (
    <FeesScreen group="other" search={search} onSearchChange={onSearchChange} />
  );
}
