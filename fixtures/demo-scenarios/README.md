# Tenet demo scenario overlays

These source overlays are intentionally separate from the clean ecommerce
baseline. The forthcoming demo runner copies them into a disposable Git
repository so it can prove both scenarios without modifying a user's checkout.

- `architecture-drift` replaces Checkout's gateway dependency with a direct raw
  database dependency.
- `semantic-holiday` raises the holiday policy to 20%.
- `semantic-premium` raises the loyalty policy to 15%.

The semantic runner will apply the latter two overlays on independent branches
and merge them without a text conflict before invoking `tenet validate`.
