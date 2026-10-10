import { sniffImageType } from './sniff-image';

const bytes = (...values: number[]) => Uint8Array.from(values);
const ascii = (text: string) => [...Buffer.from(text, 'ascii')];

describe('sniffImageType', () => {
  it('recognises a PNG', () => {
    expect(
      sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))
    ).toBe('image/png');
  });

  it('recognises a JPEG', () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe('image/jpeg');
  });

  it('recognises a WebP behind its RIFF size field', () => {
    expect(
      sniffImageType(
        bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WEBP'), ...ascii('VP8 '))
      )
    ).toBe('image/webp');
  });

  it('refuses a GIF', () => {
    expect(
      sniffImageType(bytes(...ascii('GIF89a'), 1, 0, 1, 0))
    ).toBeUndefined();
  });

  it('refuses an executable renamed to .png', () => {
    expect(
      sniffImageType(bytes(...ascii('MZ'), 0x90, 0, 3, 0))
    ).toBeUndefined();
  });

  it('refuses a RIFF container that is not WebP, and short or empty input', () => {
    expect(
      sniffImageType(bytes(...ascii('RIFF'), 1, 2, 3, 4, ...ascii('WAVE'), 0))
    ).toBeUndefined();
    expect(sniffImageType(bytes(0x89, 0x50))).toBeUndefined();
    expect(sniffImageType(bytes())).toBeUndefined();
  });
});
