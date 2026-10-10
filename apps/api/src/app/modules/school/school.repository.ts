export interface StaffRecord {
  memberId: string;
  userId: string;
  name: string;
  title: string | null;
  roles: string[];
}

export abstract class SchoolRepository {
  abstract findStaff(
    organizationId: string,
    userId: string
  ): Promise<StaffRecord | undefined>;

  abstract listStaff(organizationId: string): Promise<StaffRecord[]>;

  abstract schoolName(organizationId: string): Promise<string | undefined>;

  abstract hasStudents(organizationId: string): Promise<boolean>;
}
