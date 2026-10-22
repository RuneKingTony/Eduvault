import { UsersRoundIcon } from 'lucide-react';
import { WrongAppScreen } from '@eduvault/auth-client';
import { PORTAL_URL } from '../env';

export const PortalOnlyScreen = () => (
  <WrongAppScreen
    variant="staff"
    icon={<UsersRoundIcon />}
    title="Students and guardians use the portal."
    link={{ href: PORTAL_URL, label: 'Go to web-portal' }}
  />
);
