import { z } from 'zod';

// `rejected` is set by an admin; rejected toasts stop counting everywhere (SPEC §4.4).
export const ToastStatus = { active: 'active', rejected: 'rejected' } as const;
export const toastStatusSchema = z.enum(ToastStatus);
export type ToastStatus = z.infer<typeof toastStatusSchema>;
