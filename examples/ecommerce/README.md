# Tenet ecommerce demo

This is the clean TypeScript baseline used by Tenet's deterministic validation
fixtures. Checkout persists only through `DatabaseGateway`; the discount policies
use real `defineDiscount(...)` declarations and begin at 0% so independent branch
overlays can raise them to 20% and 15%.

Run the compliant architectural check from the workspace root with:

```bash
npm run demo:architecture:compliant
```

`npm run demo:architecture:drift` creates a disposable copy, applies the direct
Checkout-to-database overlay, and returns the expected blocking exit code.

The semantic scenarios are source overlays in `fixtures/demo-scenarios`:

- `semantic-baseline`: holiday 0%, premium loyalty 0% — passes.
- `semantic-holiday`: holiday 20%, premium loyalty 0% — passes.
- `semantic-premium`: holiday 0%, premium loyalty 15% — passes.
- `semantic-combined`: holiday 20% plus premium loyalty 15% — must block because
  the two combinable customer discounts total 35%.

Run all four semantic states in disposable repository copies with:

```bash
npm run demo:semantic:conflict
```
