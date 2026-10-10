import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { contract, type RouteOutput } from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { CalendarService } from './calendar.service';

const terms = contract.terms;
const holidays = contract.holidays;

@Controller()
export class TermsController {
  constructor(private readonly calendar: CalendarService) {}

  @Patch('terms/:id')
  @OrganizationAuth('session', 'update')
  update(
    @Org() org: OrgContext,
    @Param(zod(terms.update.params)) params: { id: string },
    @Body(zod(terms.update.body))
    body: Parameters<CalendarService['updateTerm']>[2]
  ): Promise<RouteOutput<typeof terms.update>> {
    return this.calendar.updateTerm(org, params.id, body);
  }

  @Post('terms/:id/make-current')
  @HttpCode(200)
  @OrganizationAuth('session', 'setCurrent')
  makeCurrent(
    @Org() org: OrgContext,
    @Param(zod(terms.makeCurrent.params)) params: { id: string }
  ): Promise<RouteOutput<typeof terms.makeCurrent>> {
    return this.calendar.makeCurrent(org, params.id);
  }

  @Post('terms/:id/holidays')
  @OrganizationAuth('session', 'update')
  addHoliday(
    @Org() org: OrgContext,
    @Param(zod(holidays.create.params)) params: { id: string },
    @Body(zod(holidays.create.body))
    body: Parameters<CalendarService['addHoliday']>[2]
  ): Promise<RouteOutput<typeof holidays.create>> {
    return this.calendar.addHoliday(org, params.id, body);
  }

  @Delete('holidays/:id')
  @OrganizationAuth('session', 'update')
  removeHoliday(
    @Org() org: OrgContext,
    @Param(zod(holidays.remove.params)) params: { id: string }
  ): Promise<RouteOutput<typeof holidays.remove>> {
    return this.calendar.removeHoliday(org, params.id);
  }
}
