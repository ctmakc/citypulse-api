import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface EmailResult {
  sent: boolean;
  dryRun: boolean;
  to: string;
  subject: string;
  /** Provider/message info when actually sent, or the rendered message in dry-run. */
  info?: unknown;
  error?: string;
}

export interface WebhookResult {
  delivered: boolean;
  dryRun: boolean;
  url?: string;
  status?: number;
  payload: unknown;
  error?: string;
}

const WEBHOOK_TIMEOUT_MS = 5000;

/**
 * Outbound delivery service.
 *
 * Email goes through nodemailer. If real SMTP env vars are present we build an
 * SMTP transport; otherwise we fall back to a JSON "dry-run" transport that
 * renders the message and LOGS it instead of sending — so the flow is fully
 * demoable with zero configuration and never hangs/throws.
 *
 * Webhooks POST to ALERT_WEBHOOK_URL when set, else log. Both methods are
 * wrapped so a delivery failure never propagates to the caller.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly isDryRunEmail: boolean;
  private readonly fromAddress: string;

  constructor() {
    this.fromAddress =
      process.env.SMTP_FROM ||
      process.env.MAIL_FROM ||
      'CityPulse <no-reply@citypulse.local>';

    const host = process.env.SMTP_HOST;
    if (host) {
      // Real SMTP configured.
      this.isDryRunEmail = false;
      const port = Number(process.env.SMTP_PORT) || 587;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE === 'true' || port === 465,
        auth:
          process.env.SMTP_USER && process.env.SMTP_PASS
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
      });
    } else {
      // No SMTP env — dry-run transport. `jsonTransport` renders the full
      // message to a JSON string in the result instead of dispatching it. It
      // resolves synchronously-ish and never opens a socket, so it can't hang.
      this.isDryRunEmail = true;
      this.transporter = nodemailer.createTransport({ jsonTransport: true });
      this.logger.log(
        'No SMTP_HOST configured — NotificationsService email is in DRY-RUN mode ' +
          '(messages are logged, not sent).',
      );
    }
  }

  /**
   * Send (or dry-run) an email. Always resolves — failures are caught, logged
   * and returned as `{ sent: false, error }`, never thrown.
   */
  async sendEmail(to: string, subject: string, body: string): Promise<EmailResult> {
    const message: nodemailer.SendMailOptions = {
      from: this.fromAddress,
      to,
      subject,
      text: body,
    };

    try {
      const info = await this.transporter.sendMail(message);

      if (this.isDryRunEmail) {
        // jsonTransport puts the rendered message on info.message (a string).
        const rendered = (info as { message?: unknown })?.message ?? info;
        this.logger.log(
          `[DRY-RUN EMAIL] to=${to} subject=${JSON.stringify(subject)} ` +
            `body=${JSON.stringify(body)}`,
        );
        return { sent: false, dryRun: true, to, subject, info: rendered };
      }

      this.logger.log(`Email sent to ${to} (subject: ${subject})`);
      return { sent: true, dryRun: false, to, subject, info };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email to ${to}: ${error}`);
      return { sent: false, dryRun: this.isDryRunEmail, to, subject, error };
    }
  }

  /**
   * POST a JSON payload to ALERT_WEBHOOK_URL (if configured), else log it.
   * Uses a short timeout via AbortSignal so a slow/dead endpoint can't hang the
   * caller, and never throws.
   */
  async sendWebhook(payload: unknown): Promise<WebhookResult> {
    const url = process.env.ALERT_WEBHOOK_URL;

    if (!url) {
      this.logger.log(
        `[DRY-RUN WEBHOOK] ALERT_WEBHOOK_URL not set — payload=${this.safeStringify(payload)}`,
      );
      return { delivered: false, dryRun: true, payload };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: this.safeStringify(payload),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Webhook POST to ${url} returned ${res.status}`);
        return {
          delivered: false,
          dryRun: false,
          url,
          status: res.status,
          payload,
          error: `HTTP ${res.status}`,
        };
      }
      this.logger.log(`Webhook delivered to ${url} (${res.status})`);
      return { delivered: true, dryRun: false, url, status: res.status, payload };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Webhook POST to ${url} failed: ${error}`);
      return { delivered: false, dryRun: false, url, payload, error };
    }
  }

  /**
   * Demo helper used by POST /notifications/test. Runs both channels and
   * returns exactly what was (or would have been) sent.
   */
  async sendTest(to?: string) {
    const recipient = to || process.env.ALERT_EMAIL_TO || 'ops@citypulse.local';
    const subject = '[CityPulse] Test notification';
    const body =
      'This is a test notification from CityPulse. If you are seeing this in ' +
      'logs, the dry-run transport is working; if you received it by email, ' +
      'SMTP delivery is working.';

    const sampleWebhook = {
      type: 'test',
      message: 'CityPulse test notification',
      timestamp: new Date().toISOString(),
    };

    const [email, webhook] = await Promise.all([
      this.sendEmail(recipient, subject, body),
      this.sendWebhook(sampleWebhook),
    ]);

    return {
      emailDryRun: this.isDryRunEmail,
      webhookConfigured: Boolean(process.env.ALERT_WEBHOOK_URL),
      email,
      webhook,
    };
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}
