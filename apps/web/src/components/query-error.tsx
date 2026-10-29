import { useTranslation } from 'react-i18next';

import { errorMessageKey } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/** A failed query: what went wrong and a retry button. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4">
        <p role="alert">{t(errorMessageKey(error))}</p>
        <Button variant="outline" onClick={onRetry}>
          {t('app.retry')}
        </Button>
      </CardContent>
    </Card>
  );
}
