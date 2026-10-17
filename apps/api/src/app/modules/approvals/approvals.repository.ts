export abstract class ApprovalsRepository {
  abstract currency(organizationId: string): Promise<string>;
}
