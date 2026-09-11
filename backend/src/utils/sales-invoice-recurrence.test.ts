import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SalesInvoiceRecurrenceFrequency } from "@prisma/client";

import {
  nextOccurrenceAfter,
  occurrenceIsDue,
} from "./sales-invoice-recurrence.js";

describe("sales invoice recurrence dates", () => {
  it("advances daily, weekly, and monthly", () => {
    const from = new Date("2026-01-31T12:00:00.000Z");
    assert.equal(
      nextOccurrenceAfter({
        from,
        frequency: SalesInvoiceRecurrenceFrequency.DAILY,
        generateHour: 12,
        generateMinute: 0,
      })?.toISOString(),
      "2026-02-01T12:00:00.000Z",
    );
    assert.equal(
      nextOccurrenceAfter({
        from,
        frequency: SalesInvoiceRecurrenceFrequency.WEEKLY,
        generateHour: 12,
        generateMinute: 0,
      })?.toISOString(),
      "2026-02-07T12:00:00.000Z",
    );
    assert.equal(
      nextOccurrenceAfter({
        from,
        frequency: SalesInvoiceRecurrenceFrequency.MONTHLY,
        monthDay: 31,
        generateHour: 12,
        generateMinute: 0,
      })?.toISOString(),
      "2026-02-28T12:00:00.000Z",
    );
  });

  it("uses custom interval days and explicit dates", () => {
    const from = new Date("2026-09-11T08:00:00.000Z");
    assert.equal(
      nextOccurrenceAfter({
        from,
        frequency: SalesInvoiceRecurrenceFrequency.CUSTOM,
        intervalDays: 10,
        generateHour: 12,
        generateMinute: 0,
      })?.toISOString(),
      "2026-09-21T12:00:00.000Z",
    );
    assert.equal(
      nextOccurrenceAfter({
        from,
        frequency: SalesInvoiceRecurrenceFrequency.CUSTOM,
        customDates: ["2026-09-11", "2026-09-20", "2026-10-05"],
        generateHour: 12,
        generateMinute: 0,
      })?.toISOString(),
      "2026-09-20T12:00:00.000Z",
    );
    assert.equal(
      nextOccurrenceAfter({
        from: new Date("2026-10-05T12:00:00.000Z"),
        frequency: SalesInvoiceRecurrenceFrequency.CUSTOM,
        customDates: ["2026-09-11", "2026-09-20", "2026-10-05"],
      }),
      null,
    );
  });

  it("does not generate before the scheduled clock time", () => {
    const next = new Date("2026-09-11T09:30:00.000Z");
    assert.equal(occurrenceIsDue(next, new Date("2026-09-11T09:29:00.000Z")), false);
    assert.equal(occurrenceIsDue(next, new Date("2026-09-11T09:30:00.000Z")), true);
    assert.equal(
      nextOccurrenceAfter({
        from: new Date("2026-09-11T09:30:00.000Z"),
        frequency: SalesInvoiceRecurrenceFrequency.DAILY,
        generateHour: 9,
        generateMinute: 30,
      })?.toISOString(),
      "2026-09-12T09:30:00.000Z",
    );
  });
});
