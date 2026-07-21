import { defineDiscount } from "../pricing/discount-policy.js";

export const premiumLoyaltyDiscount = defineDiscount({
  id: "premium-loyalty-discount",
  name: "premiumLoyaltyDiscount",
  percent: 0,
  stackGroup: "customer",
  combinable: true,
});
