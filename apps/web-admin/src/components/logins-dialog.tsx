import { createPortal } from 'react-dom';
import { CopyIcon, KeyRoundIcon, PrinterIcon } from 'lucide-react';
import {
  ADMIT_LOGIN_NOTE,
  GUARDIAN_RELATIONSHIP_LABELS,
  type LoginCredential,
} from '@eduvault/api-contract';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@eduvault/ui';
import { PORTAL_URL } from '../env';

interface LoginsDialogProps {
  open: boolean;
  title?: string;
  studentFirstName?: string;
  logins: readonly LoginCredential[];
  schoolName: string;
  onDone: () => void;
}

function roleLine(login: LoginCredential, studentFirstName: string): string {
  if (login.who === 'student') {
    return 'Student';
  }
  return login.relationship === undefined
    ? 'Guardian'
    : `${GUARDIAN_RELATIONSHIP_LABELS[login.relationship]} of ${studentFirstName}`;
}

const identifierOf = (login: LoginCredential) =>
  login.username === undefined
    ? { label: 'Email', value: login.email ?? '' }
    : { label: 'Username', value: login.username };

function copy(text: string): void {
  void navigator.clipboard.writeText(text).then(() => {
    toast.success('Copied.');
  });
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-sm">{value}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => {
          copy(value);
        }}
      >
        <CopyIcon />
      </Button>
    </div>
  );
}

function LoginRow({
  login,
  studentFirstName,
}: {
  login: LoginCredential;
  studentFirstName: string;
}) {
  const identifier = identifierOf(login);
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-col">
        <span className="font-semibold">{login.name}</span>
        <span className="text-xs text-muted-foreground">
          {roleLine(login, studentFirstName)}
        </span>
      </div>
      <CopyRow label={identifier.label} value={identifier.value} />
      {login.temporaryPassword === undefined ? (
        <p className="text-sm text-muted-foreground">
          They sign in with their existing login.
        </p>
      ) : (
        <CopyRow label="Temporary password" value={login.temporaryPassword} />
      )}
    </li>
  );
}

function Slips({
  logins,
  schoolName,
}: {
  logins: readonly LoginCredential[];
  schoolName: string;
}) {
  return createPortal(
    <div data-print-slips className="hidden bg-background p-8 print:block">
      {logins
        .filter((login) => login.temporaryPassword !== undefined)
        .map((login) => {
          const identifier = identifierOf(login);
          return (
            <section
              key={`${login.who}-${login.guardianId ?? login.name}`}
              className="mb-8 break-inside-avoid border-b pb-8"
            >
              <h2 className="text-lg font-semibold">{schoolName}</h2>
              <p>Portal login for {login.name}</p>
              <p>Go to {PORTAL_URL}</p>
              <p>
                {identifier.label}:{' '}
                <span className="font-mono">{identifier.value}</span>
              </p>
              <p>
                Temporary password:{' '}
                <span className="font-mono">{login.temporaryPassword}</span>
              </p>
              <p>Change this password the first time you sign in.</p>
            </section>
          );
        })}
    </div>,
    document.body
  );
}

export function LoginsDialog({
  open,
  title = 'Logins created',
  studentFirstName = 'the student',
  logins,
  schoolName,
  onDone,
}: LoginsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onDone();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon />
            {title}
          </DialogTitle>
          <DialogDescription>
            Write these down or print them now. Temporary passwords are not
            shown again.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-96 flex-col gap-3 overflow-y-auto">
          {logins.map((login) => (
            <LoginRow
              key={`${login.who}-${login.guardianId ?? login.name}`}
              login={login}
              studentFirstName={studentFirstName}
            />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{ADMIT_LOGIN_NOTE}</p>
        {open ? <Slips logins={logins} schoolName={schoolName} /> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              globalThis.print();
            }}
          >
            <PrinterIcon />
            Print slip
          </Button>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
