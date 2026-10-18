import { NativeSelect, NativeSelectOption } from '../ui/native-select';

export function CampusSelect({
  campuses,
  value,
  onChange,
  className,
}: {
  campuses: readonly { id: string; name: string }[];
  value: string | undefined;
  onChange: (campus: string | undefined) => void;
  className?: string;
}) {
  if (campuses.length <= 1) {
    return null;
  }
  return (
    <NativeSelect
      aria-label="Campus"
      className={className}
      value={value ?? ''}
      onChange={(event) => {
        onChange(event.target.value === '' ? undefined : event.target.value);
      }}
    >
      <NativeSelectOption value="">All campuses</NativeSelectOption>
      {campuses.map((campus) => (
        <NativeSelectOption key={campus.id} value={campus.id}>
          {campus.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
