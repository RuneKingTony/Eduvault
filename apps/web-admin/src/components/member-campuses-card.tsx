import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2Icon } from 'lucide-react';
import type { Campus, MemberDetail } from '@eduvault/api-contract';
import { toggled } from '@eduvault/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  toast,
} from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateMembers } from '../queries';
import { CampusToggleList } from './campus-toggle-list';

interface ToggleInput {
  campus: Campus;
  on: boolean;
}

function useToggleCampus(member: MemberDetail, isSelf: boolean) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ campus, on }: ToggleInput) => {
      return api.members.updateCampuses({
        params: { id: member.id },
        body: { campusIds: toggled(member.campusIds, campus.id, on) },
      });
    },
    onSuccess: async (saved, { campus, on }) => {
      await invalidateMembers(queryClient, isSelf);
      toast.success(
        on
          ? `${saved.name} added to ${campus.name}.`
          : `${saved.name} removed from ${campus.name}.`
      );
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function MemberCampusesCard({
  member,
  campuses,
  canEdit,
  isSelf,
}: {
  member: MemberDetail;
  campuses: readonly Campus[];
  canEdit: boolean;
  isSelf: boolean;
}) {
  const toggle = useToggleCampus(member, isSelf);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2Icon className="size-4" />
          Campuses
        </CardTitle>
        <CardDescription>
          Which campuses they see, unless a role lets them see every campus.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CampusToggleList
          campuses={campuses}
          picked={member.campusIds}
          control="switch"
          idPrefix="member-campus"
          isDisabled={(campusId) =>
            !canEdit ||
            (member.campusIds.length === 1 &&
              member.campusIds.includes(campusId)) ||
            toggle.isPending
          }
          onToggle={(campusId, on) => {
            const campus = campuses.find((entry) => entry.id === campusId);
            if (campus !== undefined) {
              toggle.mutate({ campus, on });
            }
          }}
        />
      </CardContent>
    </Card>
  );
}
