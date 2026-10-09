import { NotFoundException } from '@nestjs/common';

export const schoolNotFound = (): NotFoundException =>
  new NotFoundException('School not found');
