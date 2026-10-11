import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { InfoIcon } from 'lucide-react';
import {
  GUARDIAN_RELATIONSHIPS,
  GUARDIAN_RELATIONSHIP_LABELS,
  type GuardianLink,
  type GuardianRelationship,
} from '@eduvault/api-contract';
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorMessage,
  Label,
  SelectField,
  toast,
} from '@eduvault/ui';
import { useAdmissionRules } from '../admission-rules';
import { useApi } from '../api';
import {
  guardianQueryOptions,
  invalidateStudents,
  studentGuardiansQueryOptions,
} from '../queries';
import type { StudentRef } from './guardian-actions';
import { nameOf } from './student-bits';

interface LinkDialogProps {
  student: StudentRef;
  link: GuardianLink;
  onClose: () => void;
}

function useLinkChange(
  props: LinkDialogProps,
  body: {
    relationship: GuardianRelationship;
    paysFees: boolean;
  }
) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.students.updateGuardianLink({
        params: { id: props.student.id, guardianId: props.link.guardianId },
        body,
      }),
    onSuccess: async () => {
      await invalidateStudents(queryClient);
      toast.success('Saved.');
      props.onClose();
    },
  });
}

function LinkFields({
  relationship,
  paysFees,
  onRelationship,
  onPaysFees,
}: {
  relationship: GuardianRelationship;
  paysFees: boolean;
  onRelationship: (value: GuardianRelationship) => void;
  onPaysFees: (value: boolean) => void;
}) {
  return (
    <>
      <SelectField
        label="Relationship to this child"
        value={relationship}
        onChange={(event) => {
          onRelationship(
            GUARDIAN_RELATIONSHIPS.find(
              (candidate) => candidate === event.target.value
            ) ?? relationship
          );
        }}
      >
        {GUARDIAN_RELATIONSHIPS.map((option) => (
          <option key={option} value={option}>
            {GUARDIAN_RELATIONSHIP_LABELS[option]}
          </option>
        ))}
      </SelectField>
      <div className="flex items-center gap-2">
        <Checkbox
          id="edit-link-pays"
          checked={paysFees}
          onCheckedChange={(on) => {
            onPaysFees(on === true);
          }}
        />
        <Label htmlFor="edit-link-pays">
          Pays the school fees (receives the charges)
        </Label>
      </div>
    </>
  );
}

export function EditLinkDialog(props: LinkDialogProps) {
  const { student, link } = props;
  const [relationship, setRelationship] = useState(link.relationship);
  const [paysFees, setPaysFees] = useState(link.paysFees);
  const save = useLinkChange(props, { relationship, paysFees });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit {link.fullName}’s link to {student.firstName}
          </DialogTitle>
          <DialogDescription>
            Who they are to this child, and whether they pay the fees.
          </DialogDescription>
        </DialogHeader>
        <LinkFields
          relationship={relationship}
          paysFees={paysFees}
          onRelationship={setRelationship}
          onPaysFees={setPaysFees}
        />
        <ErrorMessage error={save.error} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => {
              save.mutate();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function removalBlock(input: {
  links: readonly GuardianLink[];
  link: GuardianLink;
  onRoll: boolean;
  requireGuardian: boolean | undefined;
}): string | null {
  const { links, link } = input;
  const payers = links.filter((candidate) => candidate.paysFees).length;
  if (link.paysFees && payers === 1 && links.length > 1) {
    return 'Tick another guardian as paying fees first.';
  }
  if (links.length === 1 && input.requireGuardian === true && input.onRoll) {
    return 'A student needs at least one guardian. Add another guardian first.';
  }
  return null;
}

function useRemoveLink(props: LinkDialogProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.students.unlinkGuardian({
        params: { id: props.student.id, guardianId: props.link.guardianId },
      }),
    onSuccess: async () => {
      await invalidateStudents(queryClient);
      toast.success(
        `${props.link.fullName} removed from ${nameOf(props.student)}.`
      );
      props.onClose();
    },
  });
}

function RemovalNotes({
  lastChild,
  block,
  name,
  schoolName,
}: {
  lastChild: boolean;
  block: string | null;
  name: string;
  schoolName: string;
}) {
  return (
    <>
      {lastChild ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            {name} has no other children here, so they will lose access to{' '}
            {schoolName} in the portal.
          </AlertDescription>
        </Alert>
      ) : null}
      {block === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{block}</AlertDescription>
        </Alert>
      )}
    </>
  );
}

function useRemovalChecks(props: LinkDialogProps) {
  const api = useApi();
  const links = useQuery(studentGuardiansQueryOptions(api, props.student.id));
  const detail = useQuery(guardianQueryOptions(api, props.link.guardianId));
  const { requireGuardian } = useAdmissionRules();
  return {
    block: removalBlock({
      links: links.data ?? [],
      link: props.link,
      onRoll: props.student.onRoll,
      requireGuardian,
    }),
    lastChild: (detail.data?.children.length ?? 2) <= 1,
  };
}

export function RemoveLinkDialog(
  props: LinkDialogProps & { schoolName: string }
) {
  const { student, link } = props;
  const remove = useRemoveLink(props);
  const { block, lastChild } = useRemovalChecks(props);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Remove {link.fullName} from {student.firstName}?
          </DialogTitle>
          <DialogDescription>
            {link.fullName} will no longer see {student.firstName} in the portal
            or receive their charges. Their other children are not affected.
            Payments they made stay on record.
          </DialogDescription>
        </DialogHeader>
        <RemovalNotes
          lastChild={lastChild}
          block={block}
          name={link.fullName}
          schoolName={props.schoolName}
        />
        <ErrorMessage error={remove.error} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={block !== null || remove.isPending}
            onClick={() => {
              remove.mutate();
            }}
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
