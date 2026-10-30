import { cva, type VariantProps } from 'class-variance-authority';

import beer from '@/assets/clan-avatars/beer.svg';
import croissant from '@/assets/clan-avatars/croissant.svg';
import crown from '@/assets/clan-avatars/crown.svg';
import flame from '@/assets/clan-avatars/flame.svg';
import shield from '@/assets/clan-avatars/shield.svg';
import star from '@/assets/clan-avatars/star.svg';
import { initials } from '@/components/user-avatar';
import { cn } from '@/lib/utils';

/** The preset clan pictures (SPEC §12 D58). Index = avatarId - 1, so never reorder; add new ones at the end. */
export const CLAN_AVATARS = [
  { id: 1, key: 'shield', src: shield },
  { id: 2, key: 'crown', src: crown },
  { id: 3, key: 'star', src: star },
  { id: 4, key: 'flame', src: flame },
  { id: 5, key: 'beer', src: beer },
  { id: 6, key: 'croissant', src: croissant },
] as const;

// Rounded squares, so a clan never looks like a user's round avatar.
const clanAvatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-lg select-none',
  {
    variants: {
      size: {
        sm: 'size-8 text-xs',
        md: 'size-10 text-sm',
        lg: 'size-16 text-xl',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

interface ClanAvatarProps extends VariantProps<typeof clanAvatarVariants> {
  name: string;
  /** 1–6 picks a picture; null shows the initials of the name. */
  avatarId: number | null;
  /** Hides it from screen readers where the name is already next to it. */
  decorative?: boolean;
  className?: string;
}

export function ClanAvatar({ name, avatarId, size, decorative, className }: ClanAvatarProps) {
  const avatar = avatarId !== null ? CLAN_AVATARS[avatarId - 1] : undefined;
  if (avatar) {
    return (
      <img
        src={avatar.src}
        alt={decorative ? '' : name}
        draggable={false}
        className={cn(clanAvatarVariants({ size }), 'bg-secondary object-cover', className)}
      />
    );
  }
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative ? true : undefined}
      className={cn(
        clanAvatarVariants({ size }),
        'bg-secondary font-semibold text-secondary-foreground',
        className,
      )}
    >
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
