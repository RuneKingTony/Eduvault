import { Injectable } from '@nestjs/common';
import type { AdmitStudentResult } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { ReservedAccountService } from '../gateway/reserved-account.service';
import { AdmissionService } from './admission.service';

/** Admits a student, then asks Monnify for the paying guardians' accounts once that has committed. */
@Injectable()
export class AdmitWithAccountService {
  constructor(
    private readonly admissions: AdmissionService,
    private readonly reservedAccounts: ReservedAccountService
  ) {}

  async admit(
    ctx: OrgContext,
    input: Parameters<AdmissionService['admit']>[1]
  ): Promise<AdmitStudentResult> {
    const admitted = await this.admissions.admit(ctx, input);
    const paying = (admitted.student.guardians ?? []).filter(
      (link) => link.paysFees
    );
    await Promise.all(
      paying.map((link) =>
        this.reservedAccounts.tryEnsureForGuardian(
          ctx.organizationId,
          link.guardianId
        )
      )
    );
    return admitted;
  }
}
