import { type Locale, localeSchema } from '@toasthub/shared';

export const MAGIC_LINK_TTL_MINUTES = 15;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const copy: Record<Locale, { subject: string; intro: string; button: string; ignore: string }> = {
  sk: {
    subject: 'Tvoj prihlasovací odkaz do Toasthubu',
    intro: `Klikni na odkaz nižšie a prihlás sa do Toasthubu. Odkaz platí ${String(MAGIC_LINK_TTL_MINUTES)} minút a dá sa použiť iba raz.`,
    button: 'Prihlásiť sa',
    ignore: 'Ak si o prihlásenie nežiadal(a), tento e-mail pokojne ignoruj.',
  },
  en: {
    subject: 'Your Toasthub sign-in link',
    intro: `Click the link below to sign in to Toasthub. The link is valid for ${String(MAGIC_LINK_TTL_MINUTES)} minutes and works only once.`,
    button: 'Sign in',
    ignore: "If you didn't ask to sign in, you can safely ignore this email.",
  },
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderMagicLinkEmail(locale: Locale, url: string): RenderedEmail {
  const t = copy[locale];
  const href = escapeHtml(url);
  const text = `${t.intro}\n\n${url}\n\n${t.ignore}\n`;
  const html = `<!doctype html>
<html lang="${locale}">
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #3b2a1a">
    <p>${escapeHtml(t.intro)}</p>
    <p><a href="${href}" style="display: inline-block; padding: 12px 20px; background: #c8752a; color: #fff; border-radius: 8px; text-decoration: none">${escapeHtml(t.button)}</a></p>
    <p style="font-size: 13px; word-break: break-all"><a href="${href}">${href}</a></p>
    <p style="font-size: 13px; color: #7a6450">${escapeHtml(t.ignore)}</p>
  </body>
</html>
`;
  return { subject: t.subject, text, html };
}

/**
 * The email language for someone without an account yet: the preferred of `sk` / `en` in an
 * `Accept-Language` header, else English (the `locale` column default).
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  let best: { locale: Locale; q: number } | undefined;
  for (const part of (header ?? '').split(',')) {
    const [tag = '', ...params] = part.trim().split(';');
    const primary = localeSchema.safeParse(tag.split('-')[0]?.toLowerCase());
    if (!primary.success) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (Number.isFinite(q) && q > 0 && (!best || q > best.q)) best = { locale: primary.data, q };
  }
  return best?.locale ?? 'en';
}
