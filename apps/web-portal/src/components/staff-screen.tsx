import { LayoutDashboardIcon } from 'lucide-react';
import { WrongAppScreen } from '@eduvault/auth-client';
import { ADMIN_URL } from '../env';

export const StaffScreen = () => (
  <WrongAppScreen
    variant="portal"
    icon={<LayoutDashboardIcon />}
    title="This portal is for students and guardians. Staff use web-admin."
    link={{ href: ADMIN_URL, label: 'Go to web-admin' }}
  />
);
