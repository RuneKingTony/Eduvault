import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  contract,
  type PortalAnnouncementListQuery,
  type PortalAnnouncementsQuery,
  type PortalFamilyStatementQuery,
  type PortalStatementQuery,
  type RouteOutput,
} from '@eduvault/api-contract';
import { Org, OrganizationAuth, type OrgContext } from '../../common/auth';
import { zod } from '../../common/http/zod.pipe';
import { PortalStoreService } from './portal-store.service';
import { PortalService } from './portal.service';

const routes = contract.portal;

@Controller('portal')
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly portalStore: PortalStoreService
  ) {}

  @Get('me')
  @OrganizationAuth('student', 'readOwn')
  me(@Org() org: OrgContext): Promise<RouteOutput<typeof routes.me>> {
    return this.portal.me(org);
  }

  @Get('children')
  @OrganizationAuth('student', 'readOwn')
  children(
    @Org() org: OrgContext
  ): Promise<RouteOutput<typeof routes.children>> {
    return this.portal.children(org);
  }

  @Get('students/:studentId')
  @OrganizationAuth('student', 'readOwn')
  student(
    @Org() org: OrgContext,
    @Param(zod(routes.student.params)) params: { studentId: string }
  ): Promise<RouteOutput<typeof routes.student>> {
    return this.portal.student(org, params.studentId);
  }

  @Get('students/:studentId/announcements')
  @OrganizationAuth('student', 'readOwn')
  announcements(
    @Org() org: OrgContext,
    @Param(zod(routes.announcements.params)) params: { studentId: string },
    @Query(zod(routes.announcements.query)) query: PortalAnnouncementsQuery
  ): Promise<RouteOutput<typeof routes.announcements>> {
    return this.portal.announcementsFor(org, params.studentId, query);
  }

  @Get('students/:studentId/announcements/all')
  @OrganizationAuth('student', 'readOwn')
  announcementList(
    @Org() org: OrgContext,
    @Param(zod(routes.announcementList.params)) params: { studentId: string },
    @Query(zod(routes.announcementList.query))
    query: PortalAnnouncementListQuery
  ): Promise<RouteOutput<typeof routes.announcementList>> {
    return this.portal.announcementListFor(org, params.studentId, query);
  }

  @Get('students/:studentId/statement')
  @OrganizationAuth('invoice', 'readOwn')
  statement(
    @Org() org: OrgContext,
    @Param(zod(routes.statement.params)) params: { studentId: string },
    @Query(zod(routes.statement.query)) query: PortalStatementQuery
  ): Promise<RouteOutput<typeof routes.statement>> {
    return this.portal.statement(org, params.studentId, query);
  }

  @Get('family-statement')
  @OrganizationAuth('invoice', 'readOwn')
  familyStatement(
    @Org() org: OrgContext,
    @Query(zod(routes.familyStatement.query)) query: PortalFamilyStatementQuery
  ): Promise<RouteOutput<typeof routes.familyStatement>> {
    return this.portal.familyStatement(org, query);
  }

  @Get('students/:studentId/purchases')
  @OrganizationAuth('invoice', 'readOwn')
  purchases(
    @Org() org: OrgContext,
    @Param(zod(routes.purchases.params)) params: { studentId: string }
  ): Promise<RouteOutput<typeof routes.purchases>> {
    return this.portalStore.purchasesFor(org, params.studentId);
  }

  @Get('students/:studentId/price-list')
  @OrganizationAuth('invoice', 'readOwn')
  priceList(
    @Org() org: OrgContext,
    @Param(zod(routes.priceList.params)) params: { studentId: string }
  ): Promise<RouteOutput<typeof routes.priceList>> {
    return this.portalStore.priceListFor(org, params.studentId);
  }
}
