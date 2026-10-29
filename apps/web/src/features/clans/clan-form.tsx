import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import {
  CLAN_DESCRIPTION_MAX,
  CLAN_NAME_MAX,
  clanDescriptionSchema,
  clanNameSchema,
} from '@toasthub/shared';

import { ApiError, errorMessageKey } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface ClanFormValues {
  name: string;
  description: string | null;
}

interface ClanFormProps {
  initial?: ClanFormValues;
  submitLabel: string;
  onSubmit: (values: ClanFormValues) => void;
  pending: boolean;
  error: unknown;
  /** Shown after a successful save. */
  savedMessage?: string | false;
  /** Called on every edit, so the parent can clear a previous result. */
  onEdit?: () => void;
}

/** Name and description of a clan (SPEC §4.8): creating one and the Owner's settings. */
export function ClanForm({
  initial,
  submitLabel,
  onSubmit,
  pending,
  error,
  savedMessage,
  onEdit,
}: ClanFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [nameInvalid, setNameInvalid] = useState(false);

  // The only conflict left once the caller is allowed to submit: another clan has the name (BR-CLAN-2).
  const nameTaken = error instanceof ApiError && error.status === 409;
  const nameError = nameInvalid
    ? t('clans.form.nameInvalid')
    : nameTaken
      ? t('clans.form.nameTaken')
      : null;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedName = clanNameSchema.safeParse(name);
    setNameInvalid(!parsedName.success);
    const parsedDescription = clanDescriptionSchema.safeParse(description);
    if (!parsedName.success || !parsedDescription.success) return;
    onSubmit({ name: parsedName.data, description: parsedDescription.data || null });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>{t('clans.form.name')}</Label>
        <Input
          id={`${id}-name`}
          name="name"
          autoComplete="off"
          maxLength={CLAN_NAME_MAX}
          value={name}
          aria-invalid={nameError !== null}
          aria-describedby={`${id}-name-hint`}
          onChange={(event) => {
            setName(event.target.value);
            setNameInvalid(false);
            onEdit?.();
          }}
        />
        <p
          id={`${id}-name-hint`}
          className={nameError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {nameError ?? t('clans.form.nameHint')}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-description`}>{t('clans.form.description')}</Label>
        <Textarea
          id={`${id}-description`}
          name="description"
          maxLength={CLAN_DESCRIPTION_MAX}
          rows={3}
          value={description}
          aria-describedby={`${id}-description-hint`}
          onChange={(event) => {
            setDescription(event.target.value);
            onEdit?.();
          }}
        />
        <p id={`${id}-description-hint`} className="text-sm text-muted-foreground">
          {t('clans.form.descriptionHint', { max: CLAN_DESCRIPTION_MAX })}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {error !== null && error !== undefined && !nameTaken && (
          <p role="alert" className="text-sm text-destructive">
            {t(errorMessageKey(error))}
          </p>
        )}
        <p role="status" className="text-sm text-muted-foreground empty:hidden">
          {savedMessage}
        </p>
        <Button type="submit" size="lg" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
