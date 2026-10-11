import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  type Announcement,
  type AnnouncementStatus,
} from '@eduvault/api-contract';
import { toast } from '@eduvault/ui';
import { useApi } from '../../api';
import { invalidateAnnouncements } from '../../queries';
import { ANNOUNCEMENT_GONE_MESSAGE } from './announcement-text';

export type RowAction = 'publish' | 'withdraw' | 'pin' | 'unpin';

const NOTICES: Record<RowAction, (row: Announcement) => string> = {
  publish: () => 'Published. Families see it on the portal now.',
  withdraw: () => 'Withdrawn. It no longer shows on the portal.',
  pin: () => 'Pinned to the top of the portal.',
  unpin: () => 'Unpinned.',
};

export function refusalMessage(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 404) {
    return ANNOUNCEMENT_GONE_MESSAGE;
  }
  return failure instanceof Error ? failure.message : 'Something went wrong';
}

export function useRowAction(onMoved: (status: AnnouncementStatus) => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: RowAction }) => {
      const params = { id };
      switch (action) {
        case 'publish': {
          return api.announcements.publish({ params });
        }
        case 'withdraw': {
          return api.announcements.withdraw({ params });
        }
        case 'pin': {
          return api.announcements.pin({ params, body: { pinned: true } });
        }
        case 'unpin': {
          return api.announcements.pin({ params, body: { pinned: false } });
        }
      }
    },
    onSuccess: async (row, { action }) => {
      await invalidateAnnouncements(queryClient);
      toast.success(NOTICES[action](row));
      onMoved(row.status);
    },
    onError: (failure) => {
      toast.error(refusalMessage(failure));
    },
  });
}
