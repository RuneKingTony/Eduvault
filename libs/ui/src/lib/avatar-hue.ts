const HUE_BUCKET_COUNT = 24;
const HUE_BUCKET_SIZE = 360 / HUE_BUCKET_COUNT;

/** A stable hue bucket class for a name: the same name is the same colour in both apps. */
export function avatarHueClass(name: string): string {
  let hue = 0;
  for (const char of name) {
    hue = (hue * 31 + (char.codePointAt(0) ?? 0)) % 360;
  }
  return `avatar-h-${Math.floor(hue / HUE_BUCKET_SIZE)}`;
}
