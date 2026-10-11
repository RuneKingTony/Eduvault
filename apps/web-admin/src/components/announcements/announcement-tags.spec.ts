import { announcementTagSchema } from '@eduvault/api-contract';
import { ANNOUNCEMENT_TAGS } from '@eduvault/ui';

describe('announcement tags', () => {
  it('gives every tag the API accepts a badge, and no other', () => {
    expect(
      Object.keys(ANNOUNCEMENT_TAGS).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(
      announcementTagSchema.options.toSorted((a, b) => a.localeCompare(b))
    );
  });
});
