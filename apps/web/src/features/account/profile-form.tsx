import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AVATAR_COUNT,
  displayNameSchema,
  profileVisibilitySchema,
  ProfileVisibility,
  type Me,
  type UpdateMe,
} from '@toasthub/shared';

import { ApiError, errorMessageKey } from '@/api/errors';
import { InitialsAvatar } from '@/components/initials-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

import { useUpdateMe } from './use-update-me';

const AVATAR_IDS = Array.from({ length: AVATAR_COUNT }, (_, index) => index + 1);
const NO_AVATAR = 'none';

interface ProfileFormProps {
  user: Me;
  submitLabel: string;
  /** Shown after a successful save. */
  savedMessage?: string;
  /** Sent along with the form's own fields. */
  extra?: UpdateMe;
}

/** Display name, avatar and visibility (SPEC §4.2); onboarding and settings both use it. */
export function ProfileForm({ user, submitLabel, savedMessage, extra }: ProfileFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [avatarId, setAvatarId] = useState(user.avatarId);
  const [visibility, setVisibility] = useState(user.profileVisibility);
  const [nameInvalid, setNameInvalid] = useState(false);
  const update = useUpdateMe();

  const serverNameInvalid =
    update.error instanceof ApiError && update.error.fields?.displayName !== undefined;
  const showNameError = nameInvalid || serverNameInvalid;

  const edited = () => {
    if (!update.isIdle) update.reset();
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = displayNameSchema.safeParse(displayName);
    setNameInvalid(!name.success);
    if (!name.success) return;
    update.mutate({
      ...extra,
      displayName: name.data,
      avatarId,
      profileVisibility: visibility,
    });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>{t('profile.displayName.label')}</Label>
        <Input
          id={`${id}-name`}
          name="displayName"
          autoComplete="nickname"
          value={displayName}
          aria-invalid={showNameError}
          aria-describedby={`${id}-name-hint`}
          onChange={(event) => {
            setDisplayName(event.target.value);
            setNameInvalid(false);
            edited();
          }}
        />
        <p
          id={`${id}-name-hint`}
          className={showNameError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {showNameError ? t('profile.displayName.invalid') : t('profile.displayName.hint')}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium">{t('profile.avatar.label')}</legend>
        <RadioGroupPrimitive.Root
          value={avatarId === null ? NO_AVATAR : String(avatarId)}
          onValueChange={(value) => {
            setAvatarId(value === NO_AVATAR ? null : Number(value));
            edited();
          }}
          className="flex flex-wrap gap-3"
        >
          {[null, ...AVATAR_IDS].map((option) => (
            <RadioGroupPrimitive.Item
              key={option ?? NO_AVATAR}
              value={option === null ? NO_AVATAR : String(option)}
              aria-label={
                option === null
                  ? t('profile.avatar.none')
                  : t('profile.avatar.option', { number: option })
              }
              className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:ring-[3px] data-[state=checked]:ring-ring"
            >
              <span aria-hidden="true">
                <InitialsAvatar name={displayName || null} avatarId={option} size="lg" />
              </span>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-sm font-medium">{t('profile.visibility.label')}</legend>
        <RadioGroup
          value={visibility}
          onValueChange={(value) => {
            setVisibility(profileVisibilitySchema.parse(value));
            edited();
          }}
        >
          {Object.values(ProfileVisibility).map((option) => (
            <div key={option} className="flex items-start gap-3">
              <RadioGroupItem
                id={`${id}-visibility-${option}`}
                value={option}
                aria-describedby={`${id}-visibility-${option}-hint`}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-visibility-${option}`}>
                  {t(`profile.visibility.${option}`)}
                </Label>
                <p id={`${id}-visibility-${option}-hint`} className="text-sm text-muted-foreground">
                  {t(`profile.visibility.${option}Hint`)}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>
      </fieldset>

      <div className="flex flex-col gap-3">
        {update.isError && !serverNameInvalid && (
          <p role="alert" className="text-sm text-destructive">
            {t(errorMessageKey(update.error))}
          </p>
        )}
        <p role="status" className="text-sm text-muted-foreground empty:hidden">
          {update.isSuccess && savedMessage}
        </p>
        <Button type="submit" size="lg" disabled={update.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
