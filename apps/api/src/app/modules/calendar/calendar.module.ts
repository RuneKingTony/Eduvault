import { Module } from '@nestjs/common';
import { EduvaultAuthModule } from '../../common/auth';
import { CalendarController } from './calendar.controller';
import { CalendarRepository } from './calendar.repository';
import { CalendarService } from './calendar.service';
import { KyselyCalendarRepository } from './kysely-calendar.repository';
import { SchoolYearsController } from './school-years.controller';
import { TermsController } from './terms.controller';

@Module({
  imports: [EduvaultAuthModule],
  controllers: [SchoolYearsController, TermsController, CalendarController],
  providers: [
    CalendarService,
    { provide: CalendarRepository, useClass: KyselyCalendarRepository },
  ],
  exports: [CalendarService],
})
export class CalendarModule {}
