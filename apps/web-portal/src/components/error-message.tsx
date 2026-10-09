export function ErrorMessage({ error }: { error: unknown }) {
  if (error === null || error === undefined) {
    return null;
  }
  return (
    <p role="alert" className="text-sm text-destructive">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </p>
  );
}
