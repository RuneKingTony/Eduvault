export function FieldError({
  message,
}: {
  message: string | null | undefined;
}) {
  return message === null || message === undefined ? null : (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
