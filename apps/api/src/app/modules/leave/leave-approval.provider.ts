import { Injectable } from '@nestjs/common';
import {
  LEAVE_TYPE_LABELS,
  leaveDaysText,
  fmtDateRange,
  schoolDays,
} from '@eduvault/shared';
import type {
  ApprovalProvider,
  ApprovalScope,
  WaitingApproval,
} from '../../common/approvals';
import { CalendarService } from '../calendar/calendar.service';
import { LeaveRepository } from './leave.repository';

@Injectable()
export class LeaveApprovalProvider implements ApprovalProvider {
  constructor(
    private readonly leave: LeaveRepository,
    private readonly calendar: CalendarService
  ) {}

  async waiting(scope: ApprovalScope): Promise<WaitingApproval[]> {
    const [waiting, holidays] = await Promise.all([
      this.leave.waiting(scope),
      this.calendar.holidayDates(scope.organizationId),
    ]);
    return waiting.map((item) => ({
      kind: 'leave',
      id: item.id,
      details: `${item.requesterName} · ${LEAVE_TYPE_LABELS[item.type]} · ${fmtDateRange(item.startsOn, item.endsOn)}. ${item.reason}`,
      amountMinor: null,
      amountText: leaveDaysText(
        schoolDays(item.startsOn, item.endsOn, holidays)
      ),
      createdById: item.createdBy,
      createdByName: item.requesterName,
      createdAt: item.createdAt,
      campusId: item.campusId,
    }));
  }
}
