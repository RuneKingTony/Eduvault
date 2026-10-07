import {
  request,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';
import { env } from './env';

class ApiError extends Error {}

export class ApiClient {
  private constructor(readonly ctx: APIRequestContext) {}

  /** Cookies persist on the context, so one client is one signed-in browser profile. */
  static async create(): Promise<ApiClient> {
    const ctx = await request.newContext({
      baseURL: env.apiUrl,
      extraHTTPHeaders: { origin: env.adminUrl },
    });
    return new ApiClient(ctx);
  }

  get(path: string): Promise<APIResponse> {
    return this.ctx.get(path);
  }

  post(path: string, data?: object): Promise<APIResponse> {
    return this.ctx.post(path, { data: data ?? {} });
  }

  delete(path: string): Promise<APIResponse> {
    return this.ctx.delete(path);
  }

  async expectJson<T>(
    res: APIResponse,
    status: number,
    step: string
  ): Promise<T> {
    if (res.status() !== status) {
      throw new ApiError(
        `${step}: expected ${status}, got ${res.status()} ${await res.text()}`
      );
    }
    return (await res.json()) as T;
  }

  dispose(): Promise<void> {
    return this.ctx.dispose();
  }
}

export async function apiIsUp(): Promise<boolean> {
  const client = await ApiClient.create();
  try {
    return (await client.get('/health')).ok();
  } catch {
    return false;
  } finally {
    await client.dispose();
  }
}
