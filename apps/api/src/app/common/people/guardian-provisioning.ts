import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  GUARDIAN_ALREADY_LINKED_MESSAGE,
  GUARDIAN_LAST_REQUIRED_MESSAGE,
  GUARDIAN_NOT_FOUND_MESSAGE,
  GUARDIAN_NO_PAYER_MESSAGE,
  GUARDIAN_PHOTO_INVALID_MESSAGE,
  guardianEmailTakenMessage,
  maxGuardiansMessage,
  type GuardianRelationship,
  type NewGuardian,
} from '@eduvault/api-contract';
import { firstFreeUsername, guardianUsernameBase } from '@eduvault/shared';
import { leavesNoPayer } from './payers';
import type { GuardianTx, LinkKey, LinkPatch } from './guardian-tx';

export const GUARDIAN_ROLE = 'guardian';

interface ProvisionInput {
  organizationId: string;
  actorId: string;
  guardian: NewGuardian;
  /** Hash of the temporary password; used only when a new user is created. */
  passwordHash: string;
}

interface ProvisionedGuardian {
  guardianId: string;
  userId: string;
  email: string | null;
  username: string | null;
  /** True when this call created the user, so its temporary password is live. */
  newLogin: boolean;
}

interface LoginInput extends ProvisionInput {
  email: string | null;
}

interface LoginOutcome {
  userId: string;
  username: string | null;
  newLogin: boolean;
}

async function emailLogin(
  tx: GuardianTx,
  input: LoginInput & { email: string }
): Promise<LoginOutcome> {
  const { organizationId, email, guardian } = input;
  const clash = await tx.findGuardianByEmail(organizationId, email);
  if (clash !== undefined) {
    throw new ConflictException(
      guardianEmailTakenMessage(email, clash.fullName)
    );
  }
  const user = await tx.findUserByEmail(email);
  if (user !== undefined) {
    await tx.addRole(organizationId, user.id, GUARDIAN_ROLE);
    return { userId: user.id, username: null, newLogin: false };
  }
  const userId = await tx.createLogin({
    organizationId,
    role: 'guardian',
    name: guardian.fullName,
    email,
    username: null,
    passwordHash: input.passwordHash,
  });
  return { userId, username: null, newLogin: true };
}

async function usernameLogin(
  tx: GuardianTx,
  input: ProvisionInput
): Promise<LoginOutcome> {
  const base = guardianUsernameBase(input.guardian.fullName);
  const username = firstFreeUsername(base, await tx.takenUsernames(base));
  const userId = await tx.createLogin({
    organizationId: input.organizationId,
    role: 'guardian',
    name: input.guardian.fullName,
    email: null,
    username,
    passwordHash: input.passwordHash,
  });
  return { userId, username, newLogin: true };
}

export async function provisionGuardian(
  tx: GuardianTx,
  input: ProvisionInput
): Promise<ProvisionedGuardian> {
  const { guardian, organizationId } = input;
  const photoFileId = guardian.photoFileId ?? null;
  if (
    photoFileId !== null &&
    !(await tx.photoIsFree(organizationId, photoFileId))
  ) {
    throw new BadRequestException(GUARDIAN_PHOTO_INVALID_MESSAGE);
  }
  const email = guardian.login.kind === 'email' ? guardian.login.email : null;
  const login =
    email === null
      ? await usernameLogin(tx, input)
      : await emailLogin(tx, { ...input, email });
  const guardianId = await tx.insertGuardian({
    organizationId,
    fullName: guardian.fullName,
    phone: guardian.phone,
    email,
    address: guardian.address,
    photoFileId,
    userId: login.userId,
    createdBy: input.actorId,
  });
  return {
    guardianId,
    userId: login.userId,
    email,
    username: login.username,
    newLogin: login.newLogin,
  };
}

interface AttachInput {
  organizationId: string;
  studentId: string;
  guardianId: string;
  userId: string;
  relationship: GuardianRelationship;
  paysFees: boolean;
  actorId: string;
}

export async function attachGuardian(
  tx: GuardianTx,
  input: AttachInput
): Promise<void> {
  await tx.addRole(input.organizationId, input.userId, GUARDIAN_ROLE);
  await tx.insertLink({
    organizationId: input.organizationId,
    guardianId: input.guardianId,
    studentId: input.studentId,
    relationship: input.relationship,
    paysFees: input.paysFees,
    createdBy: input.actorId,
  });
}

export async function assertRoomForLink(
  tx: GuardianTx,
  input: { organizationId: string; studentId: string; guardianId?: string }
): Promise<{ existingLinks: number }> {
  const [rules, links] = await Promise.all([
    tx.rules(input.organizationId),
    tx.linksOf(input.organizationId, input.studentId),
  ]);
  if (
    input.guardianId !== undefined &&
    links.some((link) => link.guardianId === input.guardianId)
  ) {
    throw new ConflictException(GUARDIAN_ALREADY_LINKED_MESSAGE);
  }
  if (links.length >= rules.maxGuardians) {
    throw new BadRequestException(maxGuardiansMessage(rules.maxGuardians));
  }
  return { existingLinks: links.length };
}

export async function changeLink(
  tx: GuardianTx,
  key: LinkKey,
  patch: LinkPatch
): Promise<void> {
  const links = await tx.linksOf(key.organizationId, key.studentId);
  if (!links.some((link) => link.guardianId === key.guardianId)) {
    throw new NotFoundException(GUARDIAN_NOT_FOUND_MESSAGE);
  }
  if (
    patch.paysFees !== undefined &&
    leavesNoPayer(links, {
      kind: 'edit',
      guardianId: key.guardianId,
      paysFees: patch.paysFees,
    })
  ) {
    throw new ConflictException(GUARDIAN_NO_PAYER_MESSAGE);
  }
  await tx.updateLink(key, patch);
}

export async function removeLink(
  tx: GuardianTx,
  key: LinkKey & { onRoll: boolean }
): Promise<void> {
  const [links, rules] = await Promise.all([
    tx.linksOf(key.organizationId, key.studentId),
    tx.rules(key.organizationId),
  ]);
  const link = links.find(
    (candidate) => candidate.guardianId === key.guardianId
  );
  if (link === undefined) {
    throw new NotFoundException(GUARDIAN_NOT_FOUND_MESSAGE);
  }
  if (leavesNoPayer(links, { kind: 'remove', guardianId: key.guardianId })) {
    throw new ConflictException(GUARDIAN_NO_PAYER_MESSAGE);
  }
  if (links.length === 1 && rules.requireGuardian && key.onRoll) {
    throw new ConflictException(GUARDIAN_LAST_REQUIRED_MESSAGE);
  }
  await tx.deleteLink(key);
  if ((await tx.countLinksOfGuardian(key.organizationId, key.guardianId)) > 0) {
    return;
  }
  const guardian = await tx.findGuardian(key.organizationId, key.guardianId);
  if (guardian !== undefined) {
    await tx.stripRole(key.organizationId, guardian.userId, GUARDIAN_ROLE);
  }
}
