import Stripe from 'stripe';

export interface CheckoutItem {
  name: string;
  /** Céntimos, IVA incluido. */
  amount: number;
}

export interface PaidSession {
  id: string;
  amount: number;
  metadata: Record<string, string>;
}

/** Pasarela de pago. En producción es Stripe; en las pruebas se sustituye por una falsa. */
export interface Payments {
  createCheckout(o: { item: CheckoutItem; email: string; metadata: Record<string, string>; successUrl: string; cancelUrl: string }): Promise<string>;
  /** Comprueba la firma del aviso de Stripe y devuelve la sesión pagada, o undefined si el aviso es de otro tipo. */
  parseWebhook(rawBody: Buffer, signature: string): PaidSession | undefined;
}

export function stripePayments(secretKey: string, webhookSecret: string): Payments {
  const stripe = new Stripe(secretKey);
  return {
    async createCheckout({ item, email, metadata, successUrl, cancelUrl }) {
      const s = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email,
        line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: item.amount, product_data: { name: item.name } } }],
        metadata,
        success_url: successUrl,
        cancel_url: cancelUrl,
        invoice_creation: { enabled: true },
        locale: 'es',
      });
      return s.url!;
    },
    parseWebhook(rawBody, signature) {
      const ev = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      if (ev.type !== 'checkout.session.completed' && ev.type !== 'checkout.session.async_payment_succeeded') return undefined;
      const s = ev.data.object as Stripe.Checkout.Session;
      if (s.payment_status !== 'paid') return undefined;
      return { id: s.id, amount: s.amount_total ?? 0, metadata: (s.metadata ?? {}) as Record<string, string> };
    },
  };
}
