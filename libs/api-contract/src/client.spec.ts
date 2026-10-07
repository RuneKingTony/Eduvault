import { ApiError, createApiClient } from './client';
import { contract } from './contract';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('createApiClient', () => {
  it('fills path params, sends the body and validates the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11',
        organizationId: '9c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22',
        campusId: '7d0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c33',
        fullName: 'Ada Obi',
        admissionNumber: 'A-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    );
    const client = createApiClient(contract, {
      baseUrl: 'http://api.test',
      fetch: fetchMock,
    });

    const student = await client.students.update({
      params: { id: '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11' },
      body: { fullName: 'Ada Obi' },
    });

    expect(student.fullName).toBe('Ada Obi');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/students/5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11',
      expect.objectContaining({ method: 'PATCH', credentials: 'include' })
    );
  });

  it('throws ApiError carrying the error body', async () => {
    const client = createApiClient(contract, {
      baseUrl: 'http://api.test',
      fetch: vi
        .fn()
        .mockResolvedValue(
          jsonResponse(403, { code: 'Forbidden', message: 'nope' })
        ),
    });

    await expect(client.schoolAccount.get({})).rejects.toMatchObject({
      status: 403,
      body: { code: 'Forbidden' },
    });
    await expect(client.schoolAccount.get({})).rejects.toBeInstanceOf(ApiError);
  });
});
