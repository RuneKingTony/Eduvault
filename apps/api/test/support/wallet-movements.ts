import type {
  PortalWalletJournalMovement,
  PortalWalletMovementList,
  WalletJournalMovement,
  WalletMovementList,
} from '@eduvault/api-contract';

/** Only journal items add up to the wallet balance; earmark items never carry money. */
export const journalItems = (
  list: WalletMovementList
): WalletJournalMovement[] =>
  list.items.filter((item) => item.type === 'journal');

export const portalJournalItems = (
  list: PortalWalletMovementList
): PortalWalletJournalMovement[] =>
  list.items.filter((item) => item.type === 'journal');
