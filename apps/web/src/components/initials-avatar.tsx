import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Literal class names so Tailwind finds them. Index = avatarId - 1 (SPEC §4.2: avatars 1–6).
const AVATAR_BACKGROUNDS = [
  'bg-avatar-1',
  'bg-avatar-2',
  'bg-avatar-3',
  'bg-avatar-4',
  'bg-avatar-5',
  'bg-avatar-6',
] as const;

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-avatar-foreground select-none',
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

interface InitialsAvatarProps extends VariantProps<typeof avatarVariants> {
  name: string | null | undefined;
  /** 1–6 picks the background; null falls back to a neutral one. */
  avatarId?: number | null;
  className?: string;
}

export function InitialsAvatar({ name, avatarId, size, className }: InitialsAvatarProps) {
  const background =
    (avatarId != null ? AVATAR_BACKGROUNDS[avatarId - 1] : undefined) ?? 'bg-secondary';
  return (
    <span
      role="img"
      aria-label={name ?? undefined}
      aria-hidden={name ? undefined : true}
      className={cn(avatarVariants({ size }), background, className)}
    >
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
