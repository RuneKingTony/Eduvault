import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [StudentController],
  providers: [StudentService],
})
export class StudentModule {}
