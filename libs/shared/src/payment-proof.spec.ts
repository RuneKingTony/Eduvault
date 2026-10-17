import { isProofFile } from './payment-proof';

describe('isProofFile', () => {
  it.each([
    ['proof.jpg', 'image/jpeg'],
    ['screenshot.png', 'image/png'],
    ['alert.webp', 'image/webp'],
    ['IMG_0042.HEIC', 'image/heic'],
    ['receipt.pdf', 'application/pdf'],
  ])('accepts %s (%s)', (name, type) => {
    expect(isProofFile({ name, type })).toBe(true);
  });

  it('falls back to the extension when the browser gives no type', () => {
    expect(isProofFile({ name: 'IMG_0042.heic', type: '' })).toBe(true);
    expect(isProofFile({ name: 'notes.docx', type: '' })).toBe(false);
    expect(isProofFile({ name: 'noextension', type: '' })).toBe(false);
  });

  it('refuses documents and other types by their content type', () => {
    expect(
      isProofFile({
        name: 'proof.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
    ).toBe(false);
    expect(isProofFile({ name: 'proof.png', type: 'image/gif' })).toBe(false);
  });
});
