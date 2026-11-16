const euroFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

export function displayEuro(cents: number): string {
  const euros = BigInt(cents) / 100n;
  const fraction = String(BigInt(cents) % 100n).padStart(2, "0");
  return euroFormatter
    .formatToParts(euros)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}
