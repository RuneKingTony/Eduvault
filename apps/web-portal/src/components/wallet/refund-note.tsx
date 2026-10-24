export function RefundNote({ email }: { email: string | null }) {
  return (
    <p className="text-sm text-muted-foreground">
      Sent money to the wrong account?{' '}
      {email === null ? (
        'Contact the school with the reference and we will look into a refund.'
      ) : (
        <>
          Email{' '}
          <a href={`mailto:${email}`} className="font-medium underline">
            {email}
          </a>{' '}
          with the reference and we will look into a refund.
        </>
      )}
    </p>
  );
}
