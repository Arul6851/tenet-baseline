# Tenet ecommerce demo

This is the clean TypeScript baseline used by Tenet's deterministic validation
fixtures. Checkout persists only through `DatabaseGateway`; the discount policies
begin at 0% so independent branch overlays can raise them to 20% and 15%.

Run the compliant architectural check from the workspace root with:

```bash
npm run demo:architecture:compliant
```

`npm run demo:architecture:drift` creates a disposable copy, applies the direct
Checkout-to-database overlay, and returns the expected blocking exit code.
