import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { IEmailService, SendEmailOptions } from './email.interface.js';

/**
 * Servicio de envío de emails usando Nodemailer.
 *
 * Configuración vía variables de entorno:
 * - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
 *
 * Si SMTP_HOST no está definido, opera en modo simulado (solo logea).
 */
@Injectable()
export class EmailService implements IEmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string;
  private readonly configured: boolean;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST', '');
    const port = this.configService.get<number>('SMTP_PORT', 587);
    const user = this.configService.get<string>('SMTP_USER', '');
    const password = this.configService.get<string>('SMTP_PASSWORD', '');
    this.fromAddress = this.configService.get<string>('SMTP_FROM', 'no-reply@e-ncf.do');

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user ? { user, pass: password } : undefined,
      });
      this.configured = true;
      this.logger.log(`Email service configured: ${host}:${port}`);
    } else {
      this.transporter = null;
      this.configured = false;
      this.logger.warn('SMTP not configured — emails will be simulated (dev mode)');
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async send(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string }> {
    if (!this.transporter) {
      this.logger.log(`[EMAIL SIMULADO] To: ${options.to} | Subject: ${options.subject}`);
      return { success: true, messageId: `simulated-${Date.now()}` };
    }

    try {
      const result = await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });

      this.logger.log(`Email sent to ${options.to}: ${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send email to ${options.to}: ${msg}`);
      return { success: false };
    }
  }
}
