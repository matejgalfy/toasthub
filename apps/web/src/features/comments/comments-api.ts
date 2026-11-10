import { infiniteQueryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { CreateComment } from '@toasthub/shared';

import { api, unwrap } from '@/api/client';

export const commentsQueryKey = (toastId: string) => ['comments', toastId] as const;

export const commentsQueryOptions = (toastId: string, topLevel = false) =>
  infiniteQueryOptions({
    queryKey: [...commentsQueryKey(toastId), topLevel ? 'preview' : 'thread'],
    queryFn: async ({ pageParam }) => {
      const page = await unwrap(
        api.GET('/api/v1/toasts/{id}/comments', {
          params: {
            path: { id: toastId },
            query: {
              ...(topLevel ? { topLevel: 'true' as const, limit: 3 } : {}),
              ...(pageParam === null ? {} : { cursor: pageParam }),
            },
          },
        }),
      );
      if (!topLevel || page.items.length >= 3) return page;
      const thread = await unwrap(
        api.GET('/api/v1/toasts/{id}/comments', {
          params: { path: { id: toastId }, query: { limit: 3 } },
        }),
      );
      return {
        ...page,
        items: [
          ...page.items,
          ...thread.items
            .filter((comment) => comment.parentId !== null)
            .slice(0, 3 - page.items.length),
        ],
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

export function useCreateComment(toastId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateComment) =>
      unwrap(api.POST('/api/v1/toasts/{id}/comments', { params: { path: { id: toastId } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentsQueryKey(toastId) }),
  });
}

export function useToggleCommentLike(toastId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, liked }: { commentId: string; liked: boolean }) => {
      const params = { params: { path: { id: commentId } } };
      return liked
        ? unwrap(api.POST('/api/v1/comments/{id}/like', params))
        : unwrap(api.DELETE('/api/v1/comments/{id}/like', params));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentsQueryKey(toastId) }),
  });
}

export function useDeleteComment(toastId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/v1/comments/{id}', { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentsQueryKey(toastId) }),
  });
}
