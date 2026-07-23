/**
 * Interfaz y tipos para el servicio de envío de emails.
 */

export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

export interface IEmailService {
  /**
   * Envía un email con las opciones dadas.
   * Si SMTP no está configurado, simula el envío en modo desarrollo.
   */
  send(options: SendEmailOptions): Promise<{ success: boolean; messageId?: string }>;

  /**
   * Indica si el servicio tiene SMTP configurado.
   */
  isConfigured(): boolean;
}
