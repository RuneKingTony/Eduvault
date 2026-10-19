import { screen } from '@testing-library/react';
import {
  SECOND_ARM_ID,
  dashboardApi,
  dayOff,
  myClass,
  renderInRouter,
} from '../../test-dashboard';
import {
  MyClassesStat,
  MyStudentsStat,
  NextHolidayStat,
} from './teacher-stats';

describe('teacher stats', () => {
  it('counts students across classes and classes as class teacher', async () => {
    const api = dashboardApi({
      myClasses: [
        myClass({ studentCount: 8 }),
        myClass({
          armId: SECOND_ARM_ID,
          studentCount: 5,
          isClassTeacher: false,
        }),
      ],
    });
    renderInRouter(
      <>
        <MyStudentsStat />
        <MyClassesStat />
      </>,
      api
    );
    expect(await screen.findByText('13')).toBeInTheDocument();
    expect(screen.getByText('Across 2 classes')).toBeInTheDocument();
    expect(screen.getByText('1 as class teacher')).toBeInTheDocument();
  });

  it('counts days to the next holiday', async () => {
    renderInRouter(
      <NextHolidayStat today="2026-10-27" />,
      dashboardApi({ daysOff: [dayOff()] })
    );
    expect(await screen.findByText('2 days')).toBeInTheDocument();
    expect(
      screen.getByText('Mid-term break · 29 Oct 2026')
    ).toBeInTheDocument();
  });

  it('says Tomorrow', async () => {
    renderInRouter(
      <NextHolidayStat today="2026-10-28" />,
      dashboardApi({ daysOff: [dayOff()] })
    );
    expect(await screen.findByText('Tomorrow')).toBeInTheDocument();
  });

  it('has a dash when no holiday is ahead', async () => {
    renderInRouter(<NextHolidayStat today="2026-10-27" />, dashboardApi());
    expect(await screen.findByText('—')).toBeInTheDocument();
    expect(screen.getByText('None this term')).toBeInTheDocument();
  });
});
