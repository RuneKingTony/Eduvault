import { screen } from '@testing-library/react';
import { SUBJECT_IDS, subjectTeachers } from '../../test-subjects';
import { renderWithApi, starterAccess } from '../../test-utils';
import { ClassSubjectTeachers } from './class-subject-teachers';

const apiFor = () => ({
  subjectTeachers: {
    list: vi.fn().mockResolvedValue(subjectTeachers()),
  },
});

describe('ClassSubjectTeachers', () => {
  it('lists this class’s subjects with their teacher, or a dash when unassigned', async () => {
    renderWithApi(
      <ClassSubjectTeachers classId={SUBJECT_IDS.gold} />,
      apiFor(),
      starterAccess('teacher')
    );
    expect(await screen.findByText('Mathematics')).toBeInTheDocument();
    expect(screen.getByText('Emeka Obi')).toBeInTheDocument();
    expect(screen.getByText('English Language')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows nothing for a class that is not listed', async () => {
    const api = apiFor();
    renderWithApi(
      <ClassSubjectTeachers classId={SUBJECT_IDS.silver} />,
      api,
      starterAccess('teacher')
    );
    await vi.waitFor(() => {
      expect(api.subjectTeachers.list).toHaveBeenCalled();
    });
    expect(screen.queryByText('Subject teachers')).not.toBeInTheDocument();
  });

  it('asks the API nothing without subject:read', () => {
    const api = apiFor();
    renderWithApi(
      <ClassSubjectTeachers classId={SUBJECT_IDS.gold} />,
      api,
      starterAccess('bursar')
    );
    expect(api.subjectTeachers.list).not.toHaveBeenCalled();
  });
});
