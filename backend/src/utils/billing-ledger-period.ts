export type BillingPeriodInput = {
  month?: string | undefined;
  quarter?: string | undefined;
  year?: string | undefined;
};

/** UTC day bounds for calendar month / quarter / year. */
export function billingPeriodToUtcRange(input: BillingPeriodInput): { from: Date; to: Date } | null {
  const month = input.month?.trim();
  if (month) {
    const m = /^(\d{4})-(\d{2})$/.exec(month);
    if (!m) {
      return null;
    }
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) {
      return null;
    }
    const from = new Date(Date.UTC(y, mo - 1, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(y, mo, 0, 23, 59, 59, 999));
    return { from, to };
  }

  const quarter = input.quarter?.trim();
  if (quarter) {
    const qm = /^(\d{4})-Q([1-4])$/i.exec(quarter);
    if (!qm) {
      return null;
    }
    const y = Number(qm[1]);
    const q = Number(qm[2]);
    const startMonth = (q - 1) * 3;
    const from = new Date(Date.UTC(y, startMonth, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(y, startMonth + 3, 0, 23, 59, 59, 999));
    return { from, to };
  }

  const year = input.year?.trim();
  if (year) {
    const ym = /^(\d{4})$/.exec(year);
    if (!ym) {
      return null;
    }
    const y = Number(ym[1]);
    const from = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
    const to = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    return { from, to };
  }

  return null;
}
