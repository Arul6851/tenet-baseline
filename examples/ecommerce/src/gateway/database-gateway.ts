import {
  RawDatabaseClient,
  type PersistedCheckout,
} from "../database/raw-database-client.js";

export class DatabaseGateway {
  public constructor(private readonly database = new RawDatabaseClient()) {}

  async persistCheckout(checkout: PersistedCheckout): Promise<PersistedCheckout> {
    return this.database.saveCheckout(checkout);
  }
}
