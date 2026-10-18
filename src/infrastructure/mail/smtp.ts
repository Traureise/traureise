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

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.config.from, ...message });
  }
}
