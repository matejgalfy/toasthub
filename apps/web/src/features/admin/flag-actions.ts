import { type AdminFlag, FlagAction, FlagStatus, FlagType } from '@toasthub/shared';

/** The i18n key under `admin.flags.actions` for each choice in the resolve dialog. */
export type FlagActionLabel = 'dismiss' | 'rejectDay' | 'rejectToast' | 'hidePhoto';

export interface FlagActionChoice {
  action: FlagAction;
  label: FlagActionLabel;
}

/**
 * What an admin can do with an open flag (BR-MOD-4): dismiss it, reject its toasts (the day's for a
 * count flag, the reported one for a photo report) or hide the photo, which only a flag with a toast
 * has (the api answers 400 otherwise, SPEC §12 D52). Resolved flags offer nothing.
 */
export function flagActionChoices(flag: AdminFlag): FlagActionChoice[] {
  if (flag.status !== FlagStatus.open) return [];
  const choices: FlagActionChoice[] = [{ action: FlagAction.dismiss, label: 'dismiss' }];
  if (flag.type === FlagType.count_threshold) {
    choices.push({ action: FlagAction.reject_toasts, label: 'rejectDay' });
  } else {
    choices.push({ action: FlagAction.reject_toasts, label: 'rejectToast' });
  }
  if (flag.toast !== null) choices.push({ action: FlagAction.hide_photo, label: 'hidePhoto' });
  return choices;
}

/** The own account can't be banned (409), so the dialog doesn't offer it. */
export const canBanSubject = (flag: AdminFlag, adminId: string) =>
  flag.subject.id !== adminId && flag.subject.status !== 'banned';
