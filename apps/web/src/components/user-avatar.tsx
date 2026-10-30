import { cva, type VariantProps } from 'class-variance-authority';

import alien from '@/assets/avatars/alien.webp';
import angel from '@/assets/avatars/angel.webp';
import astronaut from '@/assets/avatars/astronaut.webp';
import boss from '@/assets/avatars/boss.webp';
import cool from '@/assets/avatars/cool.webp';
import cyborg from '@/assets/avatars/cyborg.webp';
import monster from '@/assets/avatars/monster.webp';
import pixel from '@/assets/avatars/pixel.webp';
import { cn } from '@/lib/utils';

/** The preset pictures (SPEC §4.2). Index = avatarId - 1, so never reorder; add new ones at the end. */
export const AVATARS = [
  { id: 1, key: 'astronaut', src: astronaut },
  { id: 2, key: 'cool', src: cool },
  { id: 3, key: 'pixel', src: pixel },
  { id: 4, key: 'angel', src: angel },
  { id: 5, key: 'cyborg', src: cyborg },
  { id: 6, key: 'boss', src: boss },
  { id: 7, key: 'monster', src: monster },
  { id: 8, key: 'alien', src: alien },
] as const;

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full select-none',
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

/** Up to two letters: first and last word of the name. `?` while the name is unknown. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').normalize('NFC').trim().split(/\s+/).filter(Boolean);
  const letters = [words[0], words.length > 1 ? words.at(-1) : undefined]
    // Array.from splits by code point, so an emoji or accented letter stays whole.
    .map((word) => (word ? Array.from(word)[0] : undefined))
    .join('');
  return letters ? letters.toLocaleUpperCase() : '?';
}

interface UserAvatarProps extends VariantProps<typeof avatarVariants> {
  name: string | null | undefined;
  /** 1–8 picks a picture; null (no choice yet) shows the initials. */
  avatarId?: number | null;
  className?: string;
}

export function UserAvatar({ name, avatarId, size, className }: UserAvatarProps) {
  const avatar = avatarId != null ? AVATARS[avatarId - 1] : undefined;
  if (avatar) {
    return (
      <img
        src={avatar.src}
        alt={name ?? ''}
        draggable={false}
        className={cn(avatarVariants({ size }), 'bg-secondary object-cover', className)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name ?? undefined}
      aria-hidden={name ? undefined : true}
      className={cn(
        avatarVariants({ size }),
        'bg-secondary font-semibold text-secondary-foreground',
        className,
      )}
    >
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
