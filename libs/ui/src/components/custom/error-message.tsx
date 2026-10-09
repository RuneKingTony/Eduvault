import { FieldError } from './field-error';

export function ErrorMessage({ error }: { error: unknown }) {
  if (error === null || error === undefined) {
    return null;
  }
  return (
    <FieldError
      message={error instanceof Error ? error.message : 'Something went wrong'}
    />
  );
}
