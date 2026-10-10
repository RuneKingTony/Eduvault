import { initials } from '@eduvault/shared';
import { Avatar, AvatarFallback, avatarHueClass, cn } from '@eduvault/ui';

export function PersonAvatar({ name }: { name: string }) {
  return (
    <Avatar size="sm">
      <AvatarFallback className={cn('text-xs', avatarHueClass(name))}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
