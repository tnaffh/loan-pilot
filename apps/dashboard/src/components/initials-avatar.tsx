import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/** Round avatar showing a person's initials. */
export const InitialsAvatar = ({ name, className }: { name: string; className?: string }) => (
  <Avatar className={cn('size-9', className)}>
    <AvatarFallback className="bg-muted text-xs font-medium text-muted-foreground">
      {initials(name) || '?'}
    </AvatarFallback>
  </Avatar>
);
