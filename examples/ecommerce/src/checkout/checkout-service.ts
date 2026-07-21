import { DatabaseGateway } from "../gateway/database-gateway.js";

export interface CheckoutRequest {
  id: string;
  customerId: string;
  totalCents: number;
}

export class CheckoutService {
  public constructor(private readonly gateway = new DatabaseGateway()) {}

  async complete(request: CheckoutRequest): Promise<{ checkoutId: string }> {
    await this.gateway.persistCheckout(request);
    return { checkoutId: request.id };
  }
}
