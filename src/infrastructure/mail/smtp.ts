import nodemailer, { type Transporter } from "nodemailer";
import type { MailMessage, Mailer } from "@/application/ports";

export type SmtpConfig = { host: string; port: number; secure: boolean; user?: string; password?: string; from: string };

export class SmtpMailer implements Mailer {
  private transport: Transporter;

  constructor(private config: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async send({ fromName, attachments, ...message }: MailMessage): Promise<void> {
    await this.transport.sendMail({
      ...message,
      // Only the display name changes ("Anna & Ben über Traureise"); nodemailer quotes it, so user input never becomes a header.
      from: fromName ? { name: fromName, address: senderAddress(this.config.from) } : this.config.from,
      attachments: attachments?.map(({ filename, content, contentType, cid }) => ({ filename, content: Buffer.from(content), contentType, cid })),
    });
  }
}

/** The address part of MAIL_FROM ("Traureise <no-reply@example.org>" or a bare address). */
export function senderAddress(from: string): string {
  return /<([^<>]+)>\s*$/.exec(from)?.[1]?.trim() ?? from.trim();
}
