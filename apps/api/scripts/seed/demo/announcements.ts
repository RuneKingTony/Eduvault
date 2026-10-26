import { AnnouncementService } from '../../../src/app/modules/announcement/announcement.service';
import {
  campusIdOf,
  moveClock,
  staffContext,
  type DemoRun,
  type SchoolFacts,
} from './demo-run';
import { oldestFirst } from './ordering';

const WITHDRAWN_DAYS_AFTER = 4;

export async function runAnnouncements(
  run: DemoRun,
  school: SchoolFacts
): Promise<void> {
  const announcements = run.app.get(AnnouncementService, { strict: false });
  const principal = await staffContext(run, 'principal');
  const planned = oldestFirst(run.plan.announcements, (row) => row.daysAgo);
  for (const item of planned) {
    moveClock(run, item.daysAgo);
    const created = await announcements.create(principal, {
      title: item.title,
      body: item.body,
      tag: item.tag,
      campusId: item.campus === null ? null : campusIdOf(school, item.campus),
      pinned: false,
      status: item.status === 'draft' || item.viaDraft ? 'draft' : 'published',
    });
    if (item.viaDraft) {
      await announcements.publish(principal, created.id);
    }
    if (item.pinned) {
      await announcements.pin(principal, created.id, true);
    }
    if (item.status === 'withdrawn') {
      moveClock(run, Math.max(1, item.daysAgo - WITHDRAWN_DAYS_AFTER));
      await announcements.withdraw(principal, created.id);
    }
  }
}
