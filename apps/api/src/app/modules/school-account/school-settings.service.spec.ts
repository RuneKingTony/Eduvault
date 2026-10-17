import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  LAST_PAYMENT_METHOD_MESSAGE,
  type ApprovalRules,
  type PaymentMethods,
  type SchoolSettings,
} from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import {
  SchoolSettingsRepository,
  type PaymentMethodsOutcome,
  type SchoolSettingsPatch,
} from './school-settings.repository';
import { SchoolSettingsService } from './school-settings.service';

const ctx = {
  organizationId: 'school-a',
  user: { id: 'funmi', email: 'funmi@eduvault.test', name: 'Funmi' },
} as OrgContext;

class FakeSettings extends SchoolSettingsRepository {
  settings: SchoolSettings | undefined = {
    maxGuardians: 4,
    requireGuardian: true,
    paymentMethods: { cash: true, transfer: true, pos: true },
    receiptFooter: 'Thank you for your payment.',
    approvalRules: {
      refund: true,
      writeOff: true,
      creditNote: true,
      discount: true,
      paymentVoid: true,
    },
    approvers: ['Owner', 'Principal'],
  };
  rules: ApprovalRules | undefined = this.settings?.approvalRules;
  ruleChanges: Partial<ApprovalRules>[] = [];
  outcome: PaymentMethodsOutcome | undefined;
  patched: Partial<PaymentMethods>[] = [];
  updates: SchoolSettingsPatch[] = [];

  find() {
    return Promise.resolve(this.settings);
  }

  update(_organizationId: string, patch: SchoolSettingsPatch) {
    this.updates.push(patch);
    return Promise.resolve(
      this.settings && {
        ...this.settings,
        receiptFooter: patch.receiptFooter ?? this.settings.receiptFooter,
      }
    );
  }

  updateApprovalRules(_organizationId: string, patch: Partial<ApprovalRules>) {
    this.ruleChanges.push(patch);
    return Promise.resolve(this.rules && { ...this.rules, ...patch });
  }

  updatePaymentMethods(
    _organizationId: string,
    patch: Partial<PaymentMethods>
  ) {
    this.patched.push(patch);
    return Promise.resolve(this.outcome);
  }
}

const setup = () => {
  const repository = new FakeSettings();
  return { repository, service: new SchoolSettingsService(repository) };
};

describe('SchoolSettingsService', () => {
  it('reads the payment methods and the receipt footer with the guardian rules', async () => {
    const { service } = setup();
    await expect(service.get(ctx)).resolves.toMatchObject({
      paymentMethods: { cash: true, transfer: true, pos: true },
      receiptFooter: 'Thank you for your payment.',
    });
  });

  it('carries the five approval switches and who can approve', async () => {
    const { service } = setup();
    await expect(service.get(ctx)).resolves.toMatchObject({
      approvalRules: {
        refund: true,
        writeOff: true,
        creditNote: true,
        discount: true,
        paymentVoid: true,
      },
      approvers: ['Owner', 'Principal'],
    });
  });

  it('answers 404 when the school has no settings row', async () => {
    const { repository, service } = setup();
    repository.settings = undefined;
    await expect(service.get(ctx)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update(ctx, { receiptFooter: 'x' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('saves a new receipt footer', async () => {
    const { repository, service } = setup();
    await expect(
      service.update(ctx, { receiptFooter: 'Thank God for your payment.' })
    ).resolves.toMatchObject({ receiptFooter: 'Thank God for your payment.' });
    expect(repository.updates).toEqual([
      { receiptFooter: 'Thank God for your payment.' },
    ]);
  });
});

describe('SchoolSettingsService.updatePaymentRules', () => {
  it('returns the methods once the change is saved', async () => {
    const { repository, service } = setup();
    repository.outcome = {
      status: 'saved',
      methods: { cash: true, transfer: true, pos: false },
    };

    await expect(
      service.updatePaymentRules(ctx, { pos: false })
    ).resolves.toEqual({ cash: true, transfer: true, pos: false });
    expect(repository.patched).toEqual([{ pos: false }]);
  });

  it('refuses to switch off the last way to pay with the PRD copy', async () => {
    const { repository, service } = setup();
    repository.outcome = { status: 'none_left' };

    const refused = service.updatePaymentRules(ctx, { cash: false });

    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toThrow(LAST_PAYMENT_METHOD_MESSAGE);
  });

  it('answers 404 when the school has no settings row', async () => {
    const { service } = setup();
    await expect(
      service.updatePaymentRules(ctx, { cash: false })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SchoolSettingsService.updateApprovalRules', () => {
  it('returns the switches with the change applied', async () => {
    const { repository, service } = setup();

    await expect(
      service.updateApprovalRules(ctx, { refund: false })
    ).resolves.toEqual({
      refund: false,
      writeOff: true,
      creditNote: true,
      discount: true,
      paymentVoid: true,
    });
    expect(repository.ruleChanges).toEqual([{ refund: false }]);
  });

  it('answers 404 when the school has no settings row', async () => {
    const { repository, service } = setup();
    repository.rules = undefined;
    await expect(
      service.updateApprovalRules(ctx, { discount: false })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
