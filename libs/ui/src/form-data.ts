/** A text field's value, or '' when absent or a file. */
export const fieldValue = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === 'string' ? value : '';
};
