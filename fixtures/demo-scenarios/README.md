# Tenet demo scenario overlays

These source overlays are intentionally separate from the clean ecommerce
baseline. The forthcoming demo runner copies them into a disposable Git
repository so it can prove both scenarios without modifying a user's checkout.

- `architecture-drift` replaces Checkout's gateway dependency with a direct raw
  database dependency.
- `semantic-baseline` contains both inactive declarations (0% + 0%).
- `semantic-holiday` raises only the holiday policy to 20% (Change A).
- `semantic-premium` raises only the loyalty policy to 15% (Change B).
- `semantic-combined` contains both non-overlapping source changes (20% + 15%)
  so Git can accept the merged files without a textual conflict while Tenet
  rejects the resulting 35% combined customer discount.

The semantic demo runner copies each state into a disposable repository. Its
combined state applies the two separate source-file changes together, which
demonstrates the no-textual-conflict condition without mutating a Git checkout.
