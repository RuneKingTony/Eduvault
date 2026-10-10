import { useState } from 'react';
import { lagosDateOf } from '@eduvault/shared';

/** The Africa/Lagos date when the page opened, the same "today" the API uses. */
export function useToday(): string {
  const [today] = useState(() => lagosDateOf(new Date()));
  return today;
}
