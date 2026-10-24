import type { ReactNode } from 'react';
import { FileIcon } from 'lucide-react';
import { API_URL } from '../../env';

export function ProofLink({
  fileId,
  className,
  children,
}: {
  fileId: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`${API_URL}/files/${fileId}`}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}

export function ProofFileLink({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName: string;
}) {
  return (
    <ProofLink
      fileId={fileId}
      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
    >
      <FileIcon className="size-3.5" />
      {fileName}
    </ProofLink>
  );
}
