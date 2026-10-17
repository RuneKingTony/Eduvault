import type {
  ApprovalRules,
  PaymentMethods,
  SchoolSettings,
} from '@eduvault/api-contract';

export interface SchoolSettingsPatch {
  maxGuardians?: number;
  requireGuardian?: boolean;
  receiptFooter?: string;
}

export type PaymentMethodsOutcome =
  { status: 'saved'; methods: PaymentMethods } | { status: 'none_left' };

export abstract class SchoolSettingsRepository {
  abstract updateApprovalRules(
    organizationId: string,
    patch: Partial<ApprovalRules>,
    updatedBy: string
  ): Promise<ApprovalRules | undefined>;

  abstract find(organizationId: string): Promise<SchoolSettings | undefined>;

  abstract update(
    organizationId: string,
    patch: SchoolSettingsPatch,
    updatedBy: string
  ): Promise<SchoolSettings | undefined>;

  abstract updatePaymentMethods(
    organizationId: string,
    patch: Partial<PaymentMethods>,
    updatedBy: string
  ): Promise<PaymentMethodsOutcome | undefined>;
}
