export const escapeLike = (text: string): string =>
  text.replaceAll(/[\\%_]/g, String.raw`\$&`);
