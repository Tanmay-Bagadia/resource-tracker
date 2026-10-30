import { describe, it, expect } from "vitest";
import {
  PriceRegistry,
  AssetLookup,
  parseNAVLine,
  parseNAVData,
  navToMarketPrices,
  daysBetween,
  isPriceStale,
  getStalenessReport,
} from "./index.ts";
import type { MarketPrice } from "./index.ts";
import { instrumentId, calendarDate, paise } from "@resource-tracker/core";
import type { Instrument } from "@resource-tracker/core";

describe("@resource-tracker/market", () => {
  const inst1 = instrumentId("inst-infy");
  const inst2 = instrumentId("inst-tcs");

  describe("PriceRegistry", () => {
    it("stores and retrieves the latest price on or before asOf date", () => {
      const registry = new PriceRegistry();
      const p1: MarketPrice = {
        instrumentId: inst1,
        date: calendarDate("2025-01-05"),
        valuePaise: paise(180000),
        source: "manual",
        fetchedAt: "2025-01-05T00:00:00Z",
      };
      const p2: MarketPrice = {
        instrumentId: inst1,
        date: calendarDate("2025-01-15"),
        valuePaise: paise(185000),
        source: "manual",
        fetchedAt: "2025-01-15T00:00:00Z",
      };

      registry.setBatchPrices([p1, p2]);
      expect(registry.size()).toBe(2);

      // As of Jan 10 -> returns p1 (Jan 5)
      const asOf10 = registry.getPrice(inst1, calendarDate("2025-01-10"));
      expect(asOf10?.valuePaise).toBe(180000);

      // As of Jan 20 -> returns p2 (Jan 15)
      const asOf20 = registry.getPrice(inst1, calendarDate("2025-01-20"));
      expect(asOf20?.valuePaise).toBe(185000);

      // Before Jan 5 -> returns undefined
      const asOf01 = registry.getPrice(inst1, calendarDate("2025-01-01"));
      expect(asOf01).toBeUndefined();
    });

    it("returns sorted price history for an instrument", () => {
      const registry = new PriceRegistry();
      registry.setPrice({
        instrumentId: inst1,
        date: calendarDate("2025-01-20"),
        valuePaise: paise(190000),
        source: "manual",
        fetchedAt: "2025-01-20T00:00:00Z",
      });
      registry.setPrice({
        instrumentId: inst1,
        date: calendarDate("2025-01-10"),
        valuePaise: paise(180000),
        source: "manual",
        fetchedAt: "2025-01-10T00:00:00Z",
      });

      const history = registry.getPriceHistory(inst1);
      expect(history).toHaveLength(2);
      expect(history[0]?.date).toBe("2025-01-10");
      expect(history[1]?.date).toBe("2025-01-20");
    });

    it("clears prices and reports snapshots", () => {
      const registry = new PriceRegistry();
      registry.setPrice({
        instrumentId: inst1,
        date: calendarDate("2025-01-01"),
        valuePaise: paise(10000),
        source: "manual",
        fetchedAt: "2025-01-01T00:00:00Z",
      });

      const snapshot = registry.getSnapshot(calendarDate("2025-01-10"), 3);
      expect(snapshot.prices.size).toBe(1);
      expect(snapshot.staleInstruments).toHaveLength(1); // 9 days old > 3 days threshold

      registry.clearPrices(inst1);
      expect(registry.size()).toBe(0);
      expect(
        registry.getPrice(inst1, calendarDate("2025-01-10")),
      ).toBeUndefined();
    });
  });

  describe("NAV Parser (AMFI NAV format)", () => {
    it("parses valid semicolon-delimited AMFI line", () => {
      const line =
        "119551;INF209K01157;;Aditya Birla Sun Life Frontline Equity Fund - Growth;384.42;31-Jan-2025";
      const parsed = parseNAVLine(line);

      expect(parsed).not.toBeNull();
      expect(parsed?.schemeCode).toBe("119551");
      expect(parsed?.isin).toBe("INF209K01157");
      expect(parsed?.schemeName).toContain("Aditya Birla Sun Life");
      expect(parsed?.navValue).toBe(384.42);
      expect(parsed?.date).toBe("2025-01-31");
    });

    it("skips headers, blank lines, and non-numeric scheme codes", () => {
      expect(parseNAVLine("")).toBeNull();
      expect(parseNAVLine("   ")).toBeNull();
      expect(
        parseNAVLine(
          "Scheme Code;ISIN Div Payout;Scheme Name;Net Asset Value;Date",
        ),
      ).toBeNull();
      expect(
        parseNAVLine("Open Ended Schemes (Equity Scheme - Large Cap Fund)"),
      ).toBeNull();
    });

    it("parses full NAV text blobs and maps to MarketPrice records", () => {
      const navFile = `
Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
Open Ended Schemes (Equity Scheme - Large Cap Fund)
Aditya Birla Sun Life Mutual Fund
119551;INF209K01157;;Aditya Birla Sun Life Frontline Equity Fund - Growth;384.42;31-Jan-2025
119552;INF209K01165;;Aditya Birla Sun Life Frontline Equity Fund - IDCW;45.60;31-Jan-2025
      `.trim();

      const entries = parseNAVData(navFile);
      expect(entries).toHaveLength(2);

      const mapping = new Map<string, typeof inst1>([["119551", inst1]]);

      const prices = navToMarketPrices(entries, mapping);
      expect(prices).toHaveLength(1);
      expect(prices[0]?.instrumentId).toBe(inst1);
      expect(prices[0]?.valuePaise).toBe(38442); // 384.42 * 100
      expect(prices[0]?.source).toBe("amfi_nav");
    });
  });

  describe("AssetLookup", () => {
    const instruments: Instrument[] = [
      {
        id: inst1,
        name: "Infosys Limited",
        type: "equity",
        isin: "INE009A01021",
        amfiCode: undefined,
      },
      {
        id: inst2,
        name: "Tata Consultancy Services",
        type: "equity",
        isin: "INE467B01029",
        amfiCode: undefined,
      },
      {
        id: instrumentId("inst-hdfc-top100"),
        name: "HDFC Top 100 Fund",
        type: "mutual_fund",
        isin: "INF179K01BC3",
        amfiCode: "118989",
      },
    ];

    it("searches instruments by name with ranked relevance scoring", () => {
      const lookup = new AssetLookup(instruments);

      // Exact match -> score 1.0
      const exact = lookup.searchByName("Infosys Limited");
      expect(exact[0]?.matchScore).toBe(1.0);
      expect(exact[0]?.instrumentId).toBe(inst1);

      // Prefix match -> score 0.75
      const prefix = lookup.searchByName("Tata");
      expect(prefix[0]?.matchScore).toBe(0.75);
      expect(prefix[0]?.instrumentId).toBe(inst2);

      // Substring match -> score 0.5
      const substring = lookup.searchByName("Top");
      expect(substring[0]?.matchScore).toBe(0.5);

      // Empty search query -> empty results
      expect(lookup.searchByName("")).toEqual([]);
      expect(lookup.searchByName("NonExistentXYZ")).toEqual([]);
    });

    it("finds instruments by ISIN and AMFI code", () => {
      const lookup = new AssetLookup(instruments);

      expect(lookup.findByIsin("ine009a01021")?.id).toBe(inst1); // case-insensitive
      expect(lookup.findByAmfiCode("118989")?.name).toBe("HDFC Top 100 Fund");
      expect(lookup.findByIsin("INVALID_ISIN")).toBeUndefined();
    });

    it("upserts and returns all instruments", () => {
      const lookup = new AssetLookup([]);
      expect(lookup.getAll()).toHaveLength(0);

      lookup.upsert(instruments[0]!);
      expect(lookup.getAll()).toHaveLength(1);
    });
  });

  describe("Staleness utilities", () => {
    it("computes calendar days between dates", () => {
      expect(
        daysBetween(calendarDate("2025-01-01"), calendarDate("2025-01-05")),
      ).toBe(4);
      expect(
        daysBetween(calendarDate("2025-01-05"), calendarDate("2025-01-01")),
      ).toBe(4);
      expect(
        daysBetween(calendarDate("2025-01-01"), calendarDate("2025-01-01")),
      ).toBe(0);
    });

    it("detects price staleness against threshold", () => {
      const d1 = calendarDate("2025-01-01");
      const d2 = calendarDate("2025-01-05"); // 4 days later

      expect(isPriceStale(d1, d2, 3)).toBe(true); // 4 > 3
      expect(isPriceStale(d1, d2, 5)).toBe(false); // 4 <= 5
    });

    it("generates staleness reports for price maps", () => {
      const prices = new Map<typeof inst1, MarketPrice>([
        [
          inst1,
          {
            instrumentId: inst1,
            date: calendarDate("2025-01-01"),
            valuePaise: paise(100),
            source: "manual",
            fetchedAt: "2025-01-01T00:00:00Z",
          },
        ],
      ]);

      const report = getStalenessReport(prices, calendarDate("2025-01-10"), 3);
      expect(report).toHaveLength(1);
      expect(report[0]?.isStale).toBe(true);
      expect(report[0]?.daysSinceLastPrice).toBe(9);
    });
  });
});
