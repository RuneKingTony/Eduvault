import type { ProofFileType } from '@eduvault/shared';

export type SniffedType = ProofFileType;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];
const WEBP_OFFSET = 8;
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const FTYP = [0x66, 0x74, 0x79, 0x70];
const FTYP_OFFSET = 4;
const BRAND_OFFSET = 8;
const BRAND_LENGTH = 4;
const HEIC_BRANDS: ReadonlySet<string> = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'heif',
  'mif1',
  'msf1',
]);

const startsWith = (
  bytes: Uint8Array,
  signature: readonly number[],
  offset = 0
): boolean => signature.every((byte, index) => bytes[offset + index] === byte);

const brandOf = (bytes: Uint8Array): string =>
  String.fromCodePoint(
    ...bytes.subarray(BRAND_OFFSET, BRAND_OFFSET + BRAND_LENGTH)
  );

const isHeic = (bytes: Uint8Array): boolean =>
  startsWith(bytes, FTYP, FTYP_OFFSET) &&
  bytes.byteLength >= BRAND_OFFSET + BRAND_LENGTH &&
  HEIC_BRANDS.has(brandOf(bytes));

/** The type is read from the bytes; the client's file name and content type are never trusted. */
export function sniffFileType(bytes: Uint8Array): SniffedType | undefined {
  if (startsWith(bytes, PNG)) {
    return 'image/png';
  }
  if (startsWith(bytes, JPEG)) {
    return 'image/jpeg';
  }
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, WEBP_OFFSET)) {
    return 'image/webp';
  }
  if (startsWith(bytes, PDF)) {
    return 'application/pdf';
  }
  return isHeic(bytes) ? 'image/heic' : undefined;
}
