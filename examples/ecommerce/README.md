# Tenet ecommerce demo

This is the clean TypeScript baseline used by Tenet's deterministic validation
fixtures. Checkout persists only through `DatabaseGateway`; the discount policies
begin at 0% so independent branch overlays can raise them to 20% and 15%.
