import { ApiError, createApiClient } from './client';
import { contract } from './contract';

const jsonResponse = (status: number, body: unknown) =>
  Response.json(body, {
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

  it('sends the headers option on every call, read afresh each time', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(200, { status: 'ok' }))
      );
    let acting = 'school-a';
    const client = createApiClient(contract, {
      baseUrl: 'http://api.test',
      fetch: fetchMock,
      headers: () => ({ 'x-eduvault-acting-org': acting }),
    });

    await client.health({});
    acting = 'school-b';
    await client.health({});

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/health',
      expect.objectContaining({
        headers: { 'x-eduvault-acting-org': 'school-a' },
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/health',
      expect.objectContaining({
        headers: { 'x-eduvault-acting-org': 'school-b' },
      })
    );
  });

  it('keeps the content type beside the headers option when sending a body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = createApiClient(contract, {
      baseUrl: 'http://api.test',
      fetch: fetchMock,
      headers: () => ({ 'x-eduvault-acting-reason': 'SUP-1' }),
    });

    await client.me.setPassword({ body: { newPassword: 'long enough pw' } });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/me/password',
      expect.objectContaining({
        headers: {
          'x-eduvault-acting-reason': 'SUP-1',
          'content-type': 'application/json',
        },
      })
    );
  });

  it('sends a PUT body with path params', async () => {
    const memberId = '5b0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c11';
    const campusId = '7d0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c33';
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        id: memberId,
        userId: 'u1',
        name: 'Ada Obi',
        email: 'ada@example.com',
        username: null,
        title: 'New member',
        roles: ['member', 'teacher'],
        campusIds: [campusId],
        permissions: { student: ['read'] },
        campusScope: [campusId],
        classScope: 'all',
        lastOwner: false,
      })
    );
    const client = createApiClient(contract, {
      baseUrl: 'http://api.test',
      fetch: fetchMock,
    });

    const member = await client.members.updateRoles({
      params: { id: memberId },
      body: { roles: ['teacher'], campusIds: [campusId] },
    });

    expect(member.roles).toEqual(['member', 'teacher']);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://api.test/members/${memberId}/roles`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ roles: ['teacher'], campusIds: [campusId] }),
      })
    );
  });

  it('calls the roles routes by slug and parses a role', async () => {
    const role = {
      slug: 'cashier',
      label: 'Cashier',
      description: null,
      source: 'custom',
      permissions: { student: ['read'] },
      holderCount: 0,
      editable: true,
    };
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse(200, role)));
    const client = createApiClient(contract, {
      baseUrl: 'http://api.test',
      fetch: fetchMock,
    });

    const created = await client.roles.create({
      body: { label: 'Cashier', permissions: { student: ['read'] } },
    });
    await client.roles.update({
      params: { slug: 'cashier' },
      body: { label: 'Till' },
    });
    await client.roles.get({ params: { slug: 'cashier' } });

    expect(created.holders).toBeUndefined();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://api.test/roles',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/roles/cashier',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ label: 'Till' }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://api.test/roles/cashier',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('lists and deletes roles', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { items: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { slug: 'cashier' }))
      .mockResolvedValueOnce(
        jsonResponse(409, {
          code: 'ROLE_IN_USE',
          message: 'Ada still has this role. Take it off them first.',
        })
      );
    const client = createApiClient(contract, {
      baseUrl: 'http://api.test',
      fetch: fetchMock,
    });

    expect(await client.roles.list({})).toEqual({ items: [] });
    expect(await client.roles.remove({ params: { slug: 'cashier' } })).toEqual({
      slug: 'cashier',
    });
    await expect(
      client.roles.remove({ params: { slug: 'cashier' } })
    ).rejects.toMatchObject({ status: 409, body: { code: 'ROLE_IN_USE' } });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://api.test/roles/cashier',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
