import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Student } from '@eduvault/api-contract';
import type { OrgContext } from '../../common/auth';
import { CampusService } from '../campus/campus.service';
import { StudentRepository } from './student.repository';

interface StudentInput {
  campusId?: string;
  fullName: string;
  admissionNumber: string;
}

@Injectable()
export class StudentService {
  constructor(
    private readonly students: StudentRepository,
    private readonly campuses: CampusService
  ) {}

  async list(ctx: OrgContext, campusId?: string): Promise<Student[]> {
    if (campusId !== undefined) {
      await this.campuses.assertInScope(ctx, campusId);
    }
    return this.students.list(ctx.organizationId, ctx.campusScope, campusId);
  }

  async get(ctx: OrgContext, id: string): Promise<Student> {
    const student = await this.students.findById(
      ctx.organizationId,
      ctx.campusScope,
      id
    );
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  async create(ctx: OrgContext, input: StudentInput): Promise<Student> {
    const campusId = input.campusId ?? ctx.activeCampusId;
    if (campusId === null) {
      throw new BadRequestException(
        'campusId is required when the session has no active campus'
      );
    }
    await this.campuses.assertInScope(ctx, campusId);
    return this.students.create(ctx.organizationId, {
      campusId,
      fullName: input.fullName,
      admissionNumber: input.admissionNumber,
    });
  }

  async update(
    ctx: OrgContext,
    id: string,
    input: Partial<StudentInput>
  ): Promise<Student> {
    await this.get(ctx, id);
    if (input.campusId !== undefined) {
      await this.campuses.assertInScope(ctx, input.campusId);
    }
    const student = await this.students.update(ctx.organizationId, id, input);
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }
}
