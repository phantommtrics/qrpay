export function isCorporateIndustry(industry: string | null | undefined): boolean {
  return (industry ?? "").trim().toLowerCase() === "corporate";
}
