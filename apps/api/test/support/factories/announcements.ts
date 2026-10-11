import type { INestApplication } from '@nestjs/common';
import type {
  Announcement,
  CreateAnnouncementInput,
} from '@eduvault/api-contract';
import { AnnouncementService } from '../../../src/app/modules/announcement/announcement.service';
import { orgContextFor } from './org-context';

let sequence = 0;

export async function createAnnouncement(
  app: INestApplication,
  actor: { cookie: string },
  input: Partial<CreateAnnouncementInput> &
    Pick<CreateAnnouncementInput, 'campusId'>
): Promise<Announcement> {
  sequence += 1;
  const ctx = await orgContextFor(app, actor);
  return app.get(AnnouncementService, { strict: false }).create(ctx, {
    title: `Announcement ${sequence}`,
    body: 'Body text.',
    tag: 'general',
    status: 'published',
    ...input,
  });
}
