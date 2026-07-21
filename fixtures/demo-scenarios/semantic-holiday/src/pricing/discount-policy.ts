export interface DiscountPolicy {
  id: string;
  name: string;
  percent: number;
  stackGroup: "customer";
  combinable: boolean;
}

export const defineDiscount = (policy: DiscountPolicy): Readonly<DiscountPolicy> =>
  Object.freeze(policy);

export const holidayDiscount = defineDiscount({
  id: "holiday-discount",
  name: "holidayDiscount",
  percent: 20,
  stackGroup: "customer",
  combinable: true,
});
