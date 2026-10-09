import { Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { isSuperAdmin } from '@eduvault/policy';
import type { AppAuth } from './better-auth';
import { generateTemporaryPassword } from './temporary-password';

interface NewAccount {
  name: string;
  email: string;
  password?: string;
  mustChangePassword: boolean;
}

interface CreatedAccount {
  user: { id: string; email: string; name: string };
  temporaryPassword: string | null;
}

interface FoundAccount {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

@Injectable()
export class AccountService {
  constructor(private readonly authService: AuthService<AppAuth>) {}

  async findByEmail(email: string): Promise<FoundAccount | undefined> {
    const { internalAdapter } = await this.authService.instance.$context;
    const found = await internalAdapter.findUserByEmail(email.toLowerCase());
    if (!found) {
      return undefined;
    }
    const { id, name, role } = found.user as {
      id: string;
      name: string;
      role?: string | null;
    };
    return {
      id,
      name,
      email: found.user.email,
      isSuperAdmin: isSuperAdmin(role),
    };
  }

  async deleteAccount(userId: string): Promise<void> {
    const { internalAdapter } = await this.authService.instance.$context;
    await internalAdapter.deleteUser(userId);
  }

  /** No headers, so Better Auth treats this as a system action; sign-up is off. */
  async createAccount({
    name,
    email,
    password,
    mustChangePassword,
  }: NewAccount): Promise<CreatedAccount> {
    const temporaryPassword =
      password === undefined ? generateTemporaryPassword() : null;
    const { user } = await this.authService.api.createUser({
      body: {
        name,
        email,
        password: password ?? temporaryPassword ?? '',
        data: { mustChangePassword },
      },
    });
    return {
      user: { id: user.id, email: user.email, name: user.name },
      temporaryPassword,
    };
  }
}
