export interface PaymentRequest {
  checkoutId: string;
  amountCents: number;
  idempotencyKey: string;
}

export class PaymentService {
  async capture(request: PaymentRequest): Promise<{ paymentId: string }> {
    return { paymentId: `payment_${request.idempotencyKey}` };
  }
}
