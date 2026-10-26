import { DropdownMenu } from 'radix-ui';
import { LogOut, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { SessionUser } from '@fleet-hub/shared';
import { useLogout } from '@/auth/session';
import { Button } from './ui/button';

export function UserMenu({ user }: { user: SessionUser }) {
  const { t, i18n } = useTranslation();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <DropdownMenu.Root dir={i18n.dir()}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('user.menu')} data-testid="user-menu">
          <UserRound aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="glass z-50 min-w-56 p-1.5 text-sm"
        >
          <div className="px-2.5 py-2">
            <div className="font-medium">{user.name}</div>
            <div className="text-muted text-xs">
              <bdi dir="ltr">{user.email}</bdi> · {t(`user.role.${user.role}`)}
            </div>
          </div>
          <DropdownMenu.Separator className="bg-border my-1 h-px" />
          <DropdownMenu.Item
            className="hover:bg-border focus:bg-border flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 outline-none"
            onSelect={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
          >
            <LogOut aria-hidden className="size-4 rtl:-scale-x-100" />
            {t('user.signOut')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
