import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { TOAST_SESSION_MAX_COUNT } from '@toasthub/shared';

import { Button } from '@/components/ui/button';
import { useFormat } from '@/i18n/format';

/** The number of toasts in a session, 1–10 (SPEC §4.3 BR-TOAST-5). */
export function CountStepper({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col items-center gap-2">
      <p id={labelId} className="text-sm font-medium text-muted-foreground">
        {t('home.log.count')}
      </p>
      <div className="flex items-center gap-6">
        <Button
          variant="outline"
          size="icon-lg"
          className="rounded-full"
          aria-label={t('home.log.fewer')}
          disabled={disabled || value <= 1}
          onClick={() => {
            onChange(value - 1);
          }}
        >
          <Minus aria-hidden="true" />
        </Button>
        <output
          aria-labelledby={labelId}
          className="w-12 text-center text-4xl font-bold tabular-nums"
        >
          {format.number(value)}
        </output>
        <Button
          variant="outline"
          size="icon-lg"
          className="rounded-full"
          aria-label={t('home.log.more')}
          disabled={disabled || value >= TOAST_SESSION_MAX_COUNT}
          onClick={() => {
            onChange(value + 1);
          }}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
