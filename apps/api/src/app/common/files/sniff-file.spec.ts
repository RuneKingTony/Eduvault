import { sniffFileType } from './sniff-file';

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => [...Buffer.from(text, 'ascii')];
const ftyp = (brand: string) =>
  bytes(0, 0, 0, 0x18, ...ascii('ftyp'), ...ascii(brand), 0, 0, 0, 0);

describe('sniffFileType', () => {
  it('recognises a PNG', () => {
    expect(
      sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))
    ).toBe('image/png');
  });

  it('recognises a JPEG', () => {
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe('image/jpeg');
  });

  it('recognises a WebP behind its RIFF size field', () => {
    expect(
      sniffFileType(
        bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP'), ...ascii('VP8 '))
      )
    ).toBe('image/webp');
  });

  it('recognises a PDF', () => {
    expect(sniffFileType(bytes(...ascii('%PDF-1.7\n'), 1, 2))).toBe(
      'application/pdf'
    );
  });

  it.each(['heic', 'heix', 'heif', 'mif1', 'msf1', 'hevc'])(
    'recognises a HEIC file with the %s brand',
    (brand) => {
      expect(sniffFileType(ftyp(brand))).toBe('image/heic');
    }
  );

  it('refuses a GIF', () => {
    expect(
      sniffFileType(bytes(...ascii('GIF89a'), 1, 0, 1, 0))
    ).toBeUndefined();
  });

  it('refuses an executable renamed to .png or .pdf', () => {
    expect(sniffFileType(bytes(...ascii('MZ'), 0x90, 0, 3, 0))).toBeUndefined();
    expect(
      sniffFileType(bytes(0x7f, ...ascii('ELF'), 2, 1, 1, 0))
    ).toBeUndefined();
  });

  it('refuses a RIFF container that is not WebP, and a video ftyp', () => {
    expect(
      sniffFileType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE'), 0))
    ).toBeUndefined();
    expect(sniffFileType(ftyp('isom'))).toBeUndefined();
    expect(sniffFileType(ftyp('mp42'))).toBeUndefined();
  });

  it('refuses short or empty input and a truncated ftyp box', () => {
    expect(sniffFileType(bytes(0x89, 0x50))).toBeUndefined();
    expect(sniffFileType(bytes(0x25, 0x50, 0x44))).toBeUndefined();
    expect(
      sniffFileType(bytes(0, 0, 0, 0x18, ...ascii('ftyp')))
    ).toBeUndefined();
    expect(sniffFileType(bytes())).toBeUndefined();
  });
});
