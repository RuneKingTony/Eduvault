import { colourLiteralsInCss } from '@eduvault/ui/testing';

describe("this app's CSS", () => {
  it('keeps every colour in the theme stylesheet', () => {
    expect(colourLiteralsInCss(import.meta.dirname)).toEqual([]);
  });
});
