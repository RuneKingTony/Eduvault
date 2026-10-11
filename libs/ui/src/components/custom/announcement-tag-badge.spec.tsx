import { render, screen } from '@testing-library/react';
import {
  ANNOUNCEMENT_TAGS,
  AnnouncementTagBadge,
  type AnnouncementTagName,
} from './announcement-tag-badge';

describe('AnnouncementTagBadge', () => {
  it.each([
    ['event', 'Event', 'default'],
    ['academics', 'Academics', 'secondary'],
    ['fees', 'Fees', 'destructive'],
    ['general', 'General', 'outline'],
  ] as [AnnouncementTagName, string, string][])(
    'shows %s as %s in the %s tone',
    (tag, label, variant) => {
      render(<AnnouncementTagBadge tag={tag} />);
      const badge = screen.getByText(label);
      expect(badge).toHaveAttribute('data-variant', variant);
    }
  );

  it('maps every tag the API knows', () => {
    expect(
      Object.keys(ANNOUNCEMENT_TAGS).toSorted((a, b) => a.localeCompare(b))
    ).toEqual(['academics', 'event', 'fees', 'general']);
  });
});
