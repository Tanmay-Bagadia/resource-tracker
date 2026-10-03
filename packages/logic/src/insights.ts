import type {
  Asset,
  Liability,
  Transaction,
} from "../../core-types/src/index.ts";

export interface FinancialState {
  assets: Asset[];
  liabilities: Liability[];
  transactions: Transaction[];
  metrics: {
    runwayMonths: number;
    netWorth: number;
    savingsRate: number;
  };
  asOfMs?: number;
}

export interface Insight {
  id: string;
  level: "INFO" | "WARNING" | "CRITICAL" | "SUCCESS";
  title: string;
  message: string;
}

export interface InsightRule {
  name: string;
  evaluate: (state: FinancialState) => Insight | null;
}

export const lowRunwayRule: InsightRule = {
  name: "Low Runway Warning",
  evaluate: (state) => {
    if (state.metrics.runwayMonths >= 6) {
      return null;
    }

    if (state.metrics.runwayMonths >= 3) {
      return {
        id: "runway-warning",
        level: "WARNING",
        title: "Emergency Fund is Low",
        message: `Your runway is only ${state.metrics.runwayMonths.toFixed(
          1
        )} months. You should aim for at least 6 months of living expenses.`,
      };
    }

    return {
      id: "runway-critical",
      level: "CRITICAL",
      title: "Critical: Low Runway",
      message: `Warning! You only have ${state.metrics.runwayMonths.toFixed(
        1
      )} months of runway left. Try to cut non-essential expenses immediately.`,
    };
  },
};

export const highIdleCashRule: InsightRule = {
  name: "High Idle Cash Warning",
  evaluate: (state) => {
    if (state.metrics.runwayMonths > 12 && state.metrics.netWorth > 0) {
      return {
        id: "high-idle-cash",
        level: "INFO",
        title: "High Idle Cash Reserves",
        message: `You have ${state.metrics.runwayMonths.toFixed(
          1
        )} months of expenses in liquid cash. Consider investing surplus cash into higher-yielding assets to combat inflation.`,
      };
    }
    return null;
  },
};

export const spendingSpikeRule: InsightRule = {
  name: "Spending Spike Alert",
  evaluate: (state) => {
    const now = state.asOfMs ?? Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

    const recentBurn = state.transactions
      .filter((t) => t.type === "DEBT" && t.timestampMs >= now - sevenDaysMs)
      .reduce((sum, t) => sum + t.amount, 0);

    const previousBurn = state.transactions
      .filter(
        (t) =>
          t.type === "DEBT" &&
          t.timestampMs < now - sevenDaysMs &&
          t.timestampMs >= now - fourteenDaysMs
      )
      .reduce((sum, t) => sum + t.amount, 0);

    if (previousBurn > 0 && recentBurn > previousBurn * 1.5) {
      const percentageIncrease =
        ((recentBurn - previousBurn) / previousBurn) * 100;
      return {
        id: "spending-spike",
        level: "WARNING",
        title: "Recent Spending Spike",
        message: `You spent ₹${recentBurn.toLocaleString()} in the last 7 days, which is ${percentageIncrease.toFixed(
          0
        )}% higher than the previous week.`,
      };
    }

    return null;
  },
};

export const negativeSavingsRateRule: InsightRule = {
  name: "Negative Savings Rate Warning",
  evaluate: (state) => {
    if (state.metrics.savingsRate < 0) {
      return {
        id: "negative-savings-rate",
        level: "CRITICAL",
        title: "Living Beyond Means",
        message: `Your savings rate is ${state.metrics.savingsRate.toFixed(
          1
        )}%. You are spending more than your total income for this period.`,
      };
    }
    return null;
  },
};

export const highDebtRatioRule: InsightRule = {
  name: "High Debt Burden Warning",
  evaluate: (state) => {
    const totalAssets = state.assets.reduce(
      (sum, a) => sum + (a.currentValue || 0),
      0
    );
    const totalLiabilities = state.liabilities.reduce(
      (sum, l) => sum + (l.currentBalance || 0),
      0
    );

    if (totalAssets > 0 && totalLiabilities / totalAssets > 0.5) {
      const ratio = ((totalLiabilities / totalAssets) * 100).toFixed(0);
      return {
        id: "high-debt-ratio",
        level: "WARNING",
        title: "High Debt-to-Asset Ratio",
        message: `Your debt represents ${ratio}% of your total assets. Prioritize paying down high-interest liabilities.`,
      };
    }

    return null;
  },
};

export const defaultInsightRules: InsightRule[] = [
  lowRunwayRule,
  highIdleCashRule,
  spendingSpikeRule,
  negativeSavingsRateRule,
  highDebtRatioRule,
];

export function generateInsights(
  state: FinancialState,
  rules: InsightRule[] = defaultInsightRules
): Insight[] {
  const generatedInsights: Insight[] = [];

  for (const rule of rules) {
    const insight = rule.evaluate(state);
    if (insight !== null) {
      generatedInsights.push(insight);
    }
  }

  return generatedInsights;
}
