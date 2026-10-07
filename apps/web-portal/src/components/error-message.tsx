export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </p>
  );
}
