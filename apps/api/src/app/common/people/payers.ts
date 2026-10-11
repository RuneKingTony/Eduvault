interface PayerLink {
  guardianId: string;
  paysFees: boolean;
}

type LinkChange =
  | { kind: 'edit'; guardianId: string; paysFees: boolean }
  | { kind: 'remove'; guardianId: string };

export function defaultPayer<T extends { paysFees: boolean }>(
  drafts: readonly T[]
): T[] {
  const anyPays = drafts.some((draft) => draft.paysFees);
  return drafts.map((draft, index) =>
    index === 0 && !anyPays ? { ...draft, paysFees: true } : draft
  );
}

export const defaultPaysFees = (existingLinks: number, requested: boolean) =>
  existingLinks === 0 ? true : requested;

/** An edit or removal must not leave a student with guardians and no payer. */
export function leavesNoPayer(
  links: readonly PayerLink[],
  change: LinkChange
): boolean {
  const after =
    change.kind === 'remove'
      ? links.filter((link) => link.guardianId !== change.guardianId)
      : links.map((link) =>
          link.guardianId === change.guardianId
            ? { ...link, paysFees: change.paysFees }
            : link
        );
  return after.length > 0 && !after.some((link) => link.paysFees);
}
