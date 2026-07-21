export interface PersistedCheckout {
  id: string;
  customerId: string;
  totalCents: number;
}

export class RawDatabaseClient {
  async saveCheckout(checkout: PersistedCheckout): Promise<PersistedCheckout> {
    return checkout;
  }
}
