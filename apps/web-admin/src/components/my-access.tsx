import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MyAccessSheet,
  useAuthClient,
  usePermissions,
} from '@eduvault/auth-client';
import { useApi } from '../api';
import { campusesQueryOptions } from '../queries';
import { useSchool } from '../use-school';

interface MyAccessControl {
  openMyAccess: () => void;
}

const MyAccessContext = createContext<MyAccessControl | null>(null);

export function useMyAccess(): MyAccessControl {
  const control = useContext(MyAccessContext);
  if (control === null) {
    throw new Error('useMyAccess needs a MyAccessProvider');
  }
  return control;
}

function ShellAccessSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const api = useApi();
  const { campusScope } = usePermissions();
  const { schoolName, user } = useSchool(useAuthClient());
  const campuses = useQuery({
    ...campusesQueryOptions(api),
    enabled: open && campusScope !== 'all',
  });
  const campusNames =
    campusScope === 'all'
      ? []
      : (campuses.data ?? [])
          .filter((campus) => campusScope.includes(campus.id))
          .map((campus) => campus.name);
  return (
    <MyAccessSheet
      open={open}
      onOpenChange={onOpenChange}
      user={user}
      schoolName={schoolName}
      campusNames={campusNames}
    />
  );
}

/** One sheet, opened from the user menu or the Dashboard. */
export function MyAccessProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const control = useMemo(
    () => ({
      openMyAccess: () => {
        setOpen(true);
      },
    }),
    []
  );
  return (
    <MyAccessContext.Provider value={control}>
      {children}
      <ShellAccessSheet open={open} onOpenChange={setOpen} />
    </MyAccessContext.Provider>
  );
}
