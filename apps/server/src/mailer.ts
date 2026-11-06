import nodemailer from 'nodemailer';
import type { Config } from './config.js';

export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

/** Correo por SMTP (el buzón de Hostinger sirve: smtp.hostinger.com, puerto 465). Sin SMTP, lo escribe en el registro. */
export function createMailer(cfg: Config): Mailer {
  if (!cfg.smtp) {
    return {
      async send(to, subject, text) {
        console.log(`[correo sin SMTP] Para: ${to} | ${subject}\n${text}`);
      },
    };
  }
  const t = nodemailer.createTransport({
    host: cfg.smtp.host,
    port: cfg.smtp.port,
    secure: cfg.smtp.port === 465,
    auth: { user: cfg.smtp.user, pass: cfg.smtp.password },
  });
  return {
    async send(to, subject, text) {
      await t.sendMail({ from: cfg.smtp!.from, to, subject, text });
    },
  };
}
