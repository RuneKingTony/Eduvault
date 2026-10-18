import type { CreateLeaveInput, LeaveDto } from '@eduvault/api-contract';
import type { Fixtures, TestUser } from '../base-test';

type Api = Fixtures['api'];

export async function askLeave(
  api: Api,
  actor: TestUser,
  body: Partial<CreateLeaveInput> = {}
): Promise<LeaveDto> {
  const res = await api(actor)
    .post('/leave')
    .send({
      type: 'annual',
      startsOn: '2026-10-22',
      reason: 'Family wedding',
      ...body,
    });
  if (res.status !== 201) {
    throw new Error(`${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as LeaveDto;
}

export async function approveLeave(
  api: Api,
  actor: TestUser,
  id: string
): Promise<LeaveDto> {
  return (await api(actor).post(`/leave/${id}/approve`).expect(200))
    .body as LeaveDto;
}

export async function approvedLeave(
  api: Api,
  people: { requester: TestUser; approver: TestUser },
  body: Partial<CreateLeaveInput> = {}
): Promise<LeaveDto> {
  const leave = await askLeave(api, people.requester, body);
  return approveLeave(api, people.approver, leave.id);
}

export function markLeaveSeen(
  api: Api,
  actor: TestUser,
  through = new Date().toISOString()
) {
  return api(actor).post('/me/leave/seen').send({ through });
}

export async function cancelLeave(
  api: Api,
  actor: TestUser,
  id: string
): Promise<LeaveDto> {
  return (
    await api(actor)
      .post(`/leave/${id}/cancel`)
      .send({ reason: 'Cover is short' })
      .expect(200)
  ).body as LeaveDto;
}
