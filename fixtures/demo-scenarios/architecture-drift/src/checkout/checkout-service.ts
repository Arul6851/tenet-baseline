import { RawDatabaseClient } from "../database/raw-database-client.js";

export interface CheckoutRequest {
  id: string;
  customerId: string;
  totalCents: number;
}

export class CheckoutService {
  public constructor(private readonly database = new RawDatabaseClient()) {}

  async complete(request: CheckoutRequest): Promise<{ checkoutId: string }> {
    await this.database.saveCheckout(request);
    return { checkoutId: request.id };
  }
}
