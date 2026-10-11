import { useQuery } from '@tanstack/react-query';
import { useCan } from '@eduvault/auth-client';
import { canAdmit } from './admit-model';
import { useApi } from './api';
import {
  admissionPreviewQueryOptions,
  schoolSettingsQueryOptions,
} from './queries';

/** Admitters read the limits from the admission preview, others from school settings; with neither, the server decides. */
export function useAdmissionRules(): {
  maxGuardians: number | undefined;
  requireGuardian: boolean | undefined;
} {
  const api = useApi();
  const canPreview = useCan('student', 'create');
  const canSettings = useCan('schoolAccount', 'read');
  const preview = useQuery({
    ...admissionPreviewQueryOptions(api),
    enabled: canPreview,
    retry: false,
  });
  const settings = useQuery({
    ...schoolSettingsQueryOptions(api),
    enabled: canSettings && preview.data === undefined,
  });
  return {
    maxGuardians: preview.data?.maxGuardians ?? settings.data?.maxGuardians,
    requireGuardian:
      preview.data?.requireGuardian ?? settings.data?.requireGuardian,
  };
}

export function useCanAdmit(): boolean {
  const { requireGuardian } = useAdmissionRules();
  const canLink = useCan('guardian', 'link');
  const canCreateStudent = useCan('student', 'create');
  return canAdmit({ canCreateStudent, canLink, requireGuardian });
}
