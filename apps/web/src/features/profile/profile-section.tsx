import type { UseQueryResult } from '@tanstack/react-query';
import { useId, type ReactNode } from 'react';

import { PageSpinner } from '@/components/page-spinner';
import { QueryError } from '@/components/query-error';

/** A titled part of the profile page; `aside` sits next to the title (e.g. the year switch). */
export function ProfileSection({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex min-h-9 items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Each section loads on its own: a spinner, an error with retry, or the data. */
export function QueryContent<T>({
  query,
  children,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <SectionSpinner />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  return children(query.data);
}

export function SectionSpinner() {
  return <PageSpinner className="min-h-32" />;
}
