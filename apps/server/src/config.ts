/** Configuración leída de variables de entorno (en Hostinger se ponen en el panel de la app Node.js o en un archivo .env). */
export interface Config {
  port: number;
  /** Dirección pública, p. ej. https://app.easysoftechnic.com (para enlaces y redirecciones de Stripe). */
  publicUrl: string;
  jwtSecret: string;
  db?: { host: string; port: number; user: string; password: string; database: string };
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  smtp?: { host: string; port: number; user: string; password: string; from: string };
  /** Clave privada Ed25519 (PEM) con la que se firman los certificados de licencia. */
  licensePrivateKey?: string;
  /** Correos con permiso de administración (regalar créditos, crear licencias). */
  adminEmails: string[];
  /** Carpeta con la web compilada (apps/web/dist) que sirve el propio servidor. */
  webDist?: string;
  /** Créditos de regalo al registrarse. */
  welcomeCredits: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const need = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`Falta la variable de entorno ${k}`);
    return v;
  };
  return {
    port: Number(env.PORT ?? 3000),
    publicUrl: (env.PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    jwtSecret: need('JWT_SECRET'),
    db: env.DB_HOST
      ? { host: env.DB_HOST, port: Number(env.DB_PORT ?? 3306), user: need('DB_USER'), password: env.DB_PASSWORD ?? '', database: need('DB_NAME') }
      : undefined,
    stripeSecretKey: env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
    smtp: env.SMTP_HOST
      ? { host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 465), user: need('SMTP_USER'), password: need('SMTP_PASSWORD'), from: env.SMTP_FROM ?? need('SMTP_USER') }
      : undefined,
    licensePrivateKey: env.LICENSE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    adminEmails: (env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    webDist: env.WEB_DIST,
    welcomeCredits: Number(env.WELCOME_CREDITS ?? 3),
  };
}
