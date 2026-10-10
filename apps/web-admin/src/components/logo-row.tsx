import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import type { SchoolProfile } from '@eduvault/api-contract';
import { useCan } from '@eduvault/auth-client';
import { initials } from '@eduvault/shared';
import { Button, FieldError, SchoolCrest, toast } from '@eduvault/ui';
import { useApi } from '../api';
import { invalidateSchool } from '../queries';
import { logoSrc } from '../school-logo';
import { SettingsRow } from './settings-page';

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp';

function useLogoChange(onError: (message: string | undefined) => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  const done = async (message: string) => {
    onError(undefined);
    await invalidateSchool(queryClient);
    toast.success(message);
  };
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.set('kind', 'school_logo');
      body.set('file', file);
      const stored = await api.files.upload({ body });
      return api.schoolAccount.setLogo({ body: { fileId: stored.id } });
    },
    onSuccess: () => done('Logo saved.'),
    onError: (error) => {
      onError(error.message);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.schoolAccount.removeLogo({}),
    onSuccess: () => done('Logo removed.'),
    onError: (error) => {
      onError(error.message);
    },
  });
  return { upload, remove };
}

function LogoControls({
  hasLogo,
  busy,
  onChoose,
  onRemove,
}: {
  hasLogo: boolean;
  busy: boolean;
  onChoose: (file: File) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const [file] = event.target.files ?? [];
    event.target.value = '';
    if (file !== undefined) {
      onChoose(file);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_TYPES}
        aria-label="Logo file"
        className="sr-only"
        tabIndex={-1}
        onChange={choose}
      />
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {hasLogo ? <RefreshCwIcon /> : <PlusIcon />}
        {hasLogo ? 'Change' : 'Upload logo'}
      </Button>
      {hasLogo ? (
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onRemove}
        >
          Remove
        </Button>
      ) : null}
    </>
  );
}

export function LogoRow({ profile }: { profile: SchoolProfile }) {
  const canEdit = useCan('schoolAccount', 'update');
  const [error, setError] = useState<string | undefined>();
  const { upload, remove } = useLogoChange(setError);
  const hasLogo = profile.logoFileId !== null;
  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex flex-col gap-2">
      <SettingsRow
        label={hasLogo ? 'Your logo' : 'No logo yet'}
        description={
          hasLogo
            ? 'Looks best as a square image.'
            : 'Until you add one, your initials are shown. PNG, JPG or WebP, up to 1 MB.'
        }
        leading={
          <SchoolCrest
            name={profile.name}
            initials={initials(profile.name)}
            logoUrl={logoSrc(profile.logoUrl)}
            className="size-13 text-base"
          />
        }
      >
        {canEdit ? (
          <LogoControls
            hasLogo={hasLogo}
            busy={busy}
            onChoose={(file) => {
              upload.mutate(file);
            }}
            onRemove={() => {
              remove.mutate();
            }}
          />
        ) : null}
      </SettingsRow>
      <FieldError message={error} />
    </div>
  );
}
