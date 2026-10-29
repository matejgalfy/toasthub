import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Locale } from '@toasthub/shared';
import { createTransport, type Transporter } from 'nodemailer';

import { ConfigService } from '../../config/config.service';
import { renderMagicLinkEmail } from './magic-link-email';

export interface MagicLinkMessage {
  to: string;
  url: string;
  locale: Locale;
}

// SMTP everywhere (SPEC §12 D11): Mailpit in dev and tests, Resend in production.
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = createTransport(config.get('SMTP_URL'));
  }

  async sendMagicLink({ to, url, locale }: MagicLinkMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get('MAIL_FROM'),
      to,
      ...renderMagicLinkEmail(locale, url),
    });
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
