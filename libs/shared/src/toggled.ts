export const toggled = <T>(list: readonly T[], item: T, on: boolean): T[] => {
  const rest = list.filter((held) => held !== item);
  return on ? [...rest, item] : rest;
};
