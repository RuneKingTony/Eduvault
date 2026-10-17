import { Injectable, Module, type Provider } from '@nestjs/common';
import type { ApprovalProvider } from './approval-provider';

@Injectable()
export class ApprovalRegistry {
  private readonly providers: ApprovalProvider[] = [];

  add(provider: ApprovalProvider): void {
    this.providers.push(provider);
  }

  all(): readonly ApprovalProvider[] {
    return this.providers;
  }
}

@Module({
  providers: [ApprovalRegistry],
  exports: [ApprovalRegistry],
})
export class ApprovalRegistryModule {}

export const registerApprovals = (
  source: abstract new (...args: never[]) => ApprovalProvider
): Provider => ({
  provide: Symbol(`approvals:${source.name}`),
  useFactory: (registry: ApprovalRegistry, provider: ApprovalProvider) => {
    registry.add(provider);
  },
  inject: [ApprovalRegistry, source],
});
