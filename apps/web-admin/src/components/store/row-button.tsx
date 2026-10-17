import type { ReactNode } from 'react';

export function RowButton({
  first = false,
  onOpen,
  children,
}: {
  first?: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="block w-full text-left"
      onClick={onOpen}
      {...(first ? {} : { tabIndex: -1, 'aria-hidden': true })}
    >
      {children}
    </button>
  );
}
