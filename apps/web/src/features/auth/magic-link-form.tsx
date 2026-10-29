import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { emailSchema } from '@toasthub/shared';

import { errorMessageKey } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/i18n';

import { requestMagicLink } from './auth-api';

// Remembered on this device so "send new link" after a dead link needs no typing. The magic link may open
// in another tab, so not sessionStorage.
const LAST_EMAIL_KEY = 'toasthub.lastEmail';

function readLastEmail(): string {
  try {
    return localStorage.getItem(LAST_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeLastEmail(email: string) {
  try {
    localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    // Not remembered; the user types it again next time.
  }
}

interface MagicLinkFormProps {
  submitLabel: string;
  /** Where to go after login (a path in the app). */
  next?: string;
}

/** Email → login link, then the "check your inbox" state (SPEC §9 `/login`). */
export function MagicLinkForm({ submitLabel, next }: MagicLinkFormProps) {
  const { t } = useTranslation();
  const locale = useLocale();
  const id = useId();
  const [email, setEmail] = useState(readLastEmail);
  const [invalid, setInvalid] = useState(false);
  const request = useMutation({
    mutationFn: (address: string) => requestMagicLink(address, { locale, next }),
    onSuccess: (_, address) => {
      storeLastEmail(address);
    },
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    setInvalid(!parsed.success);
    if (parsed.success) request.mutate(parsed.data);
  };

  if (request.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <MailCheck className="size-12 text-primary" aria-hidden="true" />
        <h2 className="text-xl font-semibold">{t('auth.checkInbox.title')}</h2>
        <p className="text-muted-foreground">
          {t('auth.checkInbox.body', { email: request.variables })}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            request.reset();
          }}
        >
          {t('auth.checkInbox.otherEmail')}
        </Button>
      </div>
    );
  }

  const errorId = `${id}-error`;
  const message = invalid
    ? t('auth.email.invalid')
    : request.isError
      ? t(errorMessageKey(request.error))
      : null;
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-email`}>{t('auth.email.label')}</Label>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t('auth.email.placeholder')}
          value={email}
          aria-invalid={invalid}
          aria-describedby={message ? errorId : undefined}
          onChange={(event) => {
            setEmail(event.target.value);
            setInvalid(false);
          }}
        />
        {message && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
      </div>
      <Button type="submit" size="lg" disabled={request.isPending}>
        {submitLabel}
      </Button>
    </form>
  );
}
