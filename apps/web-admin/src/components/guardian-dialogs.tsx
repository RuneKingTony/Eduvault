import { useState } from 'react';
import type { LoginCredential } from '@eduvault/api-contract';
import { AddGuardianDialog } from './add-guardian-dialog';
import type { GuardianAction } from './guardian-actions';
import {
  EditGuardianDialog,
  GuardianProfileDialog,
  ResetLoginDialog,
} from './guardian-profile-dialogs';
import { EditLinkDialog, RemoveLinkDialog } from './link-dialogs';
import { LoginsDialog } from './logins-dialog';

interface Issued {
  logins: LoginCredential[];
  studentFirstName: string;
  title?: string;
}

type LinkAction = Extract<
  GuardianAction,
  { kind: 'add' | 'edit-link' | 'remove-link' }
>;
type ProfileAction = Exclude<GuardianAction, LinkAction>;

interface DialogProps<A extends GuardianAction> {
  action: A;
  schoolName: string;
  onAction: (action: GuardianAction | null) => void;
  onIssued: (issued: Issued) => void;
}

const isLinkAction = (action: GuardianAction): action is LinkAction =>
  action.kind === 'add' ||
  action.kind === 'edit-link' ||
  action.kind === 'remove-link';

function LinkActionDialog({
  action,
  schoolName,
  onAction,
  onIssued,
}: DialogProps<LinkAction>) {
  const close = () => {
    onAction(null);
  };
  switch (action.kind) {
    case 'add': {
      return (
        <AddGuardianDialog
          student={action.student}
          onClose={close}
          onIssued={(logins) => {
            onIssued({ logins, studentFirstName: action.student.firstName });
          }}
        />
      );
    }
    case 'edit-link': {
      return (
        <EditLinkDialog
          student={action.student}
          link={action.link}
          onClose={close}
        />
      );
    }
    case 'remove-link': {
      return (
        <RemoveLinkDialog
          student={action.student}
          link={action.link}
          schoolName={schoolName}
          onClose={close}
        />
      );
    }
  }
}

function ProfileActionDialog({
  action,
  onAction,
  onIssued,
}: DialogProps<ProfileAction>) {
  const close = () => {
    onAction(null);
  };
  switch (action.kind) {
    case 'profile': {
      return (
        <GuardianProfileDialog
          guardianId={action.guardianId}
          onAction={onAction}
        />
      );
    }
    case 'edit-details': {
      return <EditGuardianDialog guardian={action.guardian} onClose={close} />;
    }
    case 'reset-login': {
      return (
        <ResetLoginDialog
          guardian={action.guardian}
          onClose={close}
          onIssued={(logins) => {
            onIssued({
              logins,
              studentFirstName: 'the student',
              title: `New login for ${action.guardian.fullName}`,
            });
          }}
        />
      );
    }
  }
}

function ActionDialog(props: DialogProps<GuardianAction>) {
  const { action } = props;
  return isLinkAction(action) ? (
    <LinkActionDialog {...props} action={action} />
  ) : (
    <ProfileActionDialog {...props} action={action} />
  );
}

export function GuardianDialogs({
  action,
  schoolName,
  onAction,
}: {
  action: GuardianAction | null;
  schoolName: string;
  onAction: (action: GuardianAction | null) => void;
}) {
  const [issued, setIssued] = useState<Issued | null>(null);
  return (
    <>
      {action === null ? null : (
        <ActionDialog
          action={action}
          schoolName={schoolName}
          onAction={onAction}
          onIssued={setIssued}
        />
      )}
      <LoginsDialog
        open={issued !== null}
        title={issued?.title}
        studentFirstName={issued?.studentFirstName}
        logins={issued?.logins ?? []}
        schoolName={schoolName}
        onDone={() => {
          setIssued(null);
        }}
      />
    </>
  );
}
