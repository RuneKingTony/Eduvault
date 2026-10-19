import type { INestApplicationContext } from '@nestjs/common';
import type { AnnouncementTag } from '@eduvault/api-contract';
import type { OrgContext } from '../../src/app/common/auth';
import { Clock } from '../../src/app/common/clock';
import { AnnouncementService } from '../../src/app/modules/announcement/announcement.service';
import { shiftDate } from './date-shift';

type SeedCampus = 'Lekki' | 'Ikeja';

interface SeedAnnouncement {
  title: string;
  body: string;
  tag: AnnouncementTag;
  campus: SeedCampus | null;
  status: 'published' | 'draft' | 'withdrawn';
  pinned: boolean;
  daysAgo: number;
}

export const SEED_ANNOUNCEMENTS: readonly SeedAnnouncement[] = [
  {
    title: 'Mid-term break starts Thursday',
    body: 'School closes at 12 noon on Thursday and reopens on Monday 2 November. Collect your child on time.',
    tag: 'general',
    campus: null,
    status: 'published',
    pinned: true,
    daysAgo: 4,
  },
  {
    title: 'Inter-house sports day',
    body: 'Lekki families: sports day is on Saturday at 9am. Children wear their house colours and bring water.',
    tag: 'event',
    campus: 'Lekki',
    status: 'published',
    pinned: false,
    daysAgo: 2,
  },
  {
    title: 'Second-term fees open',
    body: 'Invoices for second term are ready. Pay at the school office or by transfer before the end of the month.',
    tag: 'fees',
    campus: null,
    status: 'published',
    pinned: false,
    daysAgo: 9,
  },
  {
    title: 'Ikeja science fair',
    body: 'SS 1 Science pupils show their projects on Friday afternoon. Parents are welcome.',
    tag: 'academics',
    campus: 'Ikeja',
    status: 'published',
    pinned: false,
    daysAgo: 6,
  },
  {
    title: 'PTA meeting, Saturday 17 October',
    body: 'We meet in the hall at 10am to talk about the new term.',
    tag: 'event',
    campus: null,
    status: 'draft',
    pinned: false,
    daysAgo: 1,
  },
  {
    title: 'Lekki uniform check',
    body: 'Prefects check uniforms on Monday morning.',
    tag: 'general',
    campus: 'Lekki',
    status: 'draft',
    pinned: false,
    daysAgo: 1,
  },
  {
    title: 'Bus route change',
    body: 'The Lekki bus now stops at the Admiralty gate.',
    tag: 'general',
    campus: null,
    status: 'withdrawn',
    pinned: false,
    daysAgo: 20,
  },
  {
    title: 'Ikeja library closed',
    body: 'The library is closed for painting this week.',
    tag: 'academics',
    campus: 'Ikeja',
    status: 'withdrawn',
    pinned: false,
    daysAgo: 12,
  },
];

export async function seedAnnouncements(
  app: INestApplicationContext,
  options: {
    author: OrgContext;
    campusIds: ReadonlyMap<string, string>;
    today: string;
  }
): Promise<void> {
  const { author, campusIds, today } = options;
  const announcements = app.get(AnnouncementService, { strict: false });
  const clock = app.get(Clock, { strict: false });
  try {
    for (const item of SEED_ANNOUNCEMENTS) {
      clock.set(shiftDate(today, -item.daysAgo));
      const campusId =
        item.campus === null
          ? null
          : (campusIds.get(`greenfield/${item.campus}`) ?? null);
      if (item.campus !== null && campusId === null) {
        throw new Error(`Seed has no campus ${item.campus}`);
      }
      const created = await announcements.create(author, {
        title: item.title,
        body: item.body,
        tag: item.tag,
        campusId,
        pinned: item.pinned,
        status: item.status === 'draft' ? 'draft' : 'published',
      });
      if (item.status === 'withdrawn') {
        await announcements.withdraw(author, created.id);
      }
    }
  } finally {
    clock.set(today);
  }
}
