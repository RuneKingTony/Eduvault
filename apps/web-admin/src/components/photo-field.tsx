import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ImageUpIcon } from 'lucide-react';
import {
  GUARDIAN_PHOTO_MAX_BYTES,
  GUARDIAN_PHOTO_SIZE_MESSAGE,
  GUARDIAN_PHOTO_TYPES,
  GUARDIAN_PHOTO_TYPE_MESSAGE,
} from '@eduvault/api-contract';
import { Button, FieldError, toast } from '@eduvault/ui';
import { useApi } from '../api';
import { PersonAvatar } from './student-bits';

export interface PhotoValue {
  fileId: string | null;
  preview: string | null;
}

/** The type and size checks the server repeats; null means the file is fine. */
export function photoProblem(file: Pick<File, 'type' | 'size'>): string | null {
  if (!(GUARDIAN_PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return GUARDIAN_PHOTO_TYPE_MESSAGE;
  }
  return file.size > GUARDIAN_PHOTO_MAX_BYTES
    ? GUARDIAN_PHOTO_SIZE_MESSAGE
    : null;
}

function useUploadPhoto(onChange: (value: PhotoValue) => void) {
  const api = useApi();
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.set('kind', 'guardian_photo');
      body.set('file', file);
      const stored = await api.files.upload({ body });
      return { fileId: stored.id, preview: URL.createObjectURL(file) };
    },
    onSuccess: (value) => {
      onChange(value);
    },
  });
}

function PhotoButtons({
  chosen,
  busy,
  onPick,
  onRemove,
}: {
  chosen: boolean;
  busy: boolean;
  onPick: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={onPick}
      >
        <ImageUpIcon />
        {chosen ? 'Change photo' : 'Choose photo'}
      </Button>
      {chosen ? (
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      ) : null}
    </>
  );
}

function usePhotoChoice(onChange: (value: PhotoValue) => void) {
  const [error, setError] = useState<string | undefined>();
  const upload = useUploadPhoto(onChange);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const [file] = event.target.files ?? [];
    event.target.value = '';
    if (file === undefined) {
      return;
    }
    const problem = photoProblem(file);
    if (problem !== null) {
      toast.error(problem);
      return;
    }
    setError(undefined);
    upload.mutate(file, {
      onError: (failure) => {
        setError(failure.message);
      },
    });
  }

  return { choose, error, busy: upload.isPending };
}

export function PhotoField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: PhotoValue;
  onChange: (value: PhotoValue) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const photo = usePhotoChoice(onChange);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Photo (optional)</span>
      <div className="flex items-center gap-3">
        {value.preview === null ? (
          <PersonAvatar name={name === '' ? 'Guardian' : name} />
        ) : (
          <img
            src={value.preview}
            alt=""
            className="size-8 rounded-full object-cover"
          />
        )}
        <input
          ref={input}
          type="file"
          accept={GUARDIAN_PHOTO_TYPES.join(',')}
          aria-label="Photo file"
          className="sr-only"
          tabIndex={-1}
          onChange={photo.choose}
        />
        <PhotoButtons
          chosen={value.fileId !== null}
          busy={photo.busy}
          onPick={() => input.current?.click()}
          onRemove={() => {
            onChange({ fileId: null, preview: null });
          }}
        />
      </div>
      <FieldError message={photo.error} />
    </div>
  );
}
