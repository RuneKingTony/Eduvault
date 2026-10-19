import { toPermissionMap, type Permission } from '@eduvault/policy';
import type { StudentDetail } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import type { CampusService } from '../campus/campus.service';
import type { GuardianService } from '../guardian/guardian.service';
import {
  StudentRepository,
  type StudentDetailTarget,
  type StudentListParams,
  type StudentListResult,
} from './student.repository';
import { StudentService } from './student.service';
import type { CampusClassScope } from '../../common/scope';

const ORG = 'school-a';
const STUDENT = '9c0f1e1e-6e53-4c52-9f1c-0a1d7a7f9c22';

class FakeStudents extends StudentRepository {
  listed: StudentListParams[] = [];
  read: StudentDetailTarget[] = [];

  today() {
    return '2026-10-11';
  }

  list(
    _organizationId: string,
    _scope: CampusClassScope,
    params: StudentListParams
  ): Promise<StudentListResult> {
    this.listed.push(params);
    return Promise.resolve({
      items: [],
      total: 0,
      counts: { active: 0, new: 0, inactive: 0, left: 0, graduated: 0 },
      ...(params.withFinance ? { currency: 'NGN' } : {}),
    });
  }

  findDetail(
    _organizationId: string,
    _scope: CampusClassScope,
    target: StudentDetailTarget
  ) {
    this.read.push(target);
    return Promise.resolve({
      id: target.id,
      ...(target.withFinance ? { currency: 'NGN' } : {}),
    } as StudentDetail);
  }

  isVisible() {
    return Promise.resolve(true);
  }

  update() {
    return Promise.resolve();
  }
}

const context = (...permissions: Permission[]): OrgContext => ({
  user: { id: 'staff-1', email: 'staff@example.com', name: 'Tunde' },
  organizationId: ORG,
  roles: ['administrator'],
  permissions: toPermissionMap(permissions),
  isOwner: false,
  activeCampusId: null,
  campusScope: 'all',
  classScope: 'all',
  studentScope: [],
  acting: null,
  headers: new Headers(),
});

const setup = () => {
  const students = new FakeStudents();
  const service = new StudentService(
    students,
    {} as unknown as CampusService,
    {} as unknown as GuardianService
  );
  return { students, service };
};

const query = { tab: 'active', page: 1, pageSize: 10 } as const;

const readers = [
  ['invoice:read', context('student:read', 'invoice:read')],
  ['payment:read', context('student:read', 'payment:read')],
] as const;

describe('StudentService finance fields', () => {
  describe.each(readers)('for a reader with %s', (_name, ctx) => {
    it('asks the list for finance and adds the school currency', async () => {
      const { students, service } = setup();
      const list = await service.list(ctx, query);
      expect(students.listed[0]?.withFinance).toBe(true);
      expect(list.currency).toBe('NGN');
    });

    it('asks the detail for finance and adds the school currency', async () => {
      const { students, service } = setup();
      const detail = await service.get(ctx, STUDENT);
      expect(students.read).toEqual([{ id: STUDENT, withFinance: true }]);
      expect(detail.currency).toBe('NGN');
    });

    it('does the same for a student the caller has just admitted', async () => {
      const { students, service } = setup();
      const detail = await service.getAdmitted(ctx, STUDENT);
      expect(students.read).toEqual([{ id: STUDENT, withFinance: true }]);
      expect(detail.currency).toBe('NGN');
    });
  });

  describe('for a reader with neither permission', () => {
    const teacher = context('student:read');

    it('keeps finance and the currency off the list', async () => {
      const { students, service } = setup();
      const list = await service.list(teacher, query);
      expect(students.listed[0]?.withFinance).toBe(false);
      expect(list).not.toHaveProperty('currency');
    });

    it('keeps finance and the currency off the detail', async () => {
      const { students, service } = setup();
      const detail = await service.get(teacher, STUDENT);
      expect(students.read).toEqual([{ id: STUDENT, withFinance: false }]);
      expect(detail).not.toHaveProperty('currency');
    });

    it('keeps finance and the currency off an admitted student', async () => {
      const { students, service } = setup();
      const detail = await service.getAdmitted(teacher, STUDENT);
      expect(students.read).toEqual([{ id: STUDENT, withFinance: false }]);
      expect(detail).not.toHaveProperty('currency');
    });
  });
});
