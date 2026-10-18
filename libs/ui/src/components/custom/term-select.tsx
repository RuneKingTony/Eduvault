import { NativeSelect, NativeSelectOption } from '../ui/native-select';

export function TermSelect({
  terms,
  value,
  onChange,
}: {
  terms: readonly { id: string; label: string }[];
  value: string | undefined;
  onChange: (term: string | undefined) => void;
}) {
  return (
    <NativeSelect
      aria-label="Term"
      className="w-full sm:w-64"
      value={value ?? ''}
      onChange={(event) => {
        onChange(event.target.value === '' ? undefined : event.target.value);
      }}
    >
      <NativeSelectOption value="">Whole history</NativeSelectOption>
      {terms.map((term) => (
        <NativeSelectOption key={term.id} value={term.id}>
          {term.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
