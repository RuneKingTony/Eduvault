import { screen } from '@testing-library/react';
import {
  ARM_ID,
  dashboardApi,
  myClass,
  person,
  renderInRouter,
} from '../../test-dashboard';
import { MyClassesCard } from './my-classes-card';

describe('MyClassesCard', () => {
  it('lists the class with its badge, campus, avatars and what the avatars leave out', async () => {
    const api = dashboardApi({
      myClasses: [
        myClass({
          studentCount: 8,
          sampleStudents: [1, 2, 3, 4, 5].map((n) => person(n)),
        }),
      ],
    });
    renderInRouter(<MyClassesCard />, api);
    expect(await screen.findByText('JSS 3 Gold')).toBeInTheDocument();
    expect(screen.getByText('Class teacher')).toBeInTheDocument();
    expect(screen.getByText(/8 students · Lekki campus/)).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /JSS 3 Gold/ })).toHaveAttribute(
      'href',
      `/classes/${ARM_ID}`
    );
    expect(screen.getByRole('link', { name: 'All classes' })).toHaveAttribute(
      'href',
      '/classes'
    );
  });

  it('leaves the badge off a class the member only assists', async () => {
    renderInRouter(
      <MyClassesCard />,
      dashboardApi({
        myClasses: [myClass({ isClassTeacher: false, studentCount: 1 })],
      })
    );
    expect(
      await screen.findByText(/1 student · Lekki campus/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Class teacher')).not.toBeInTheDocument();
  });

  it('shows the subjects a subject-only teacher teaches as badges', async () => {
    renderInRouter(
      <MyClassesCard />,
      dashboardApi({
        myClasses: [
          myClass({
            isClassTeacher: false,
            subjects: ['Mathematics', 'French'],
          }),
        ],
      })
    );
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('French')).toBeInTheDocument();
    expect(screen.queryByText('Class teacher')).not.toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    renderInRouter(<MyClassesCard />, dashboardApi());
    expect(await screen.findByText('No classes yet')).toBeInTheDocument();
    expect(
      screen.getByText('Classes you teach show up here.')
    ).toBeInTheDocument();
  });

  it('shows its own error', async () => {
    const api = dashboardApi();
    api.dashboard.myClasses.mockRejectedValue(
      new Error('Classes are unavailable')
    );
    renderInRouter(<MyClassesCard />, api);
    expect(
      await screen.findByText('Classes are unavailable')
    ).toBeInTheDocument();
  });
});
