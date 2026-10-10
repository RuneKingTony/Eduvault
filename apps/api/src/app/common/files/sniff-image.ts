export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const WEBP_OFFSET = 8;

const startsWith = (
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0
): boolean => signature.every((byte, index) => bytes[offset + index] === byte);

/** The type is read from the bytes; the client's file name and content type are never trusted. */
export function sniffImageType(bytes: Uint8Array): ImageType | undefined {
  if (startsWith(bytes, PNG)) {
    return 'image/png';
  }
  if (startsWith(bytes, JPEG)) {
    return 'image/jpeg';
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, WEBP_OFFSET)) {
    return 'image/webp';
  }
  return undefined;
}
