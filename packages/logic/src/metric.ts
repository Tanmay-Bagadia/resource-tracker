import { TRANSACTION_TYPE } from "../../core-types/src/index.ts";
import type { Transaction } from "../../core-types/src/index.ts";
import type { Asset, Liability } from "../../core-types/src/index.ts";

export function calculateBurnRate(transactions: Transaction[], currTimeMs: number) {
  const sevenDaysMs = 1000 * 60 * 60 * 24 * 7;
  let totalBurn: number = 0;

  const filteredTransactions = transactions.filter(
    (transaction) =>
      transaction.timestampMs >= currTimeMs - sevenDaysMs &&
      transaction.type == TRANSACTION_TYPE.DEBT
  );

  totalBurn = filteredTransactions.reduce((sum, currTransaction) => {
    return sum + currTransaction.amount;
  }, 0);

  let totalBurnRate: number = totalBurn / 7;

  return totalBurnRate;
}

export function calculateNetWorth(assets: Asset[], liabilities: Liability[]) {
  return (
    assets.reduce((sum, asset) => sum + asset.currentValue, 0) -
    liabilities.reduce((sum, liability) => sum + liability.currentBalance, 0)
  );
}
export function calculateSavingsRate(income: number, expenses: number) {
  if (income <= 0) return 0;
  return ((income - expenses) / income) * 100;
}

export function calculateAssetAllocation(assets: Asset[]) {
  const allocation: Record<string, number> = {};

  for (const asset of assets) {
    if (!allocation[asset.type]) {
      allocation[asset.type] = 0;
    }
    allocation[asset.type] += asset.currentValue || 0;
  }

  return allocation;
}

export function calculateRunway(
  liquidAssetsValue: number,
  monthlyBurn: number
) {
  if (monthlyBurn <= 0) return Infinity;
  return liquidAssetsValue / monthlyBurn;
}

export function calculateLiquidityRatio(
  liquidAssetsValue: number,
  monthlyExpenses: number
) {
  if (monthlyExpenses <= 0) return Infinity;
  return liquidAssetsValue / monthlyExpenses;
}

export function calculateTotalIncome(transactions: Transaction[]) {
  return transactions
    .filter((transaction) => transaction.type === TRANSACTION_TYPE.CREDIT)
    .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
}

export function calculateTotalExpenses(transactions: Transaction[]) {
  return transactions
    .filter((transaction) => transaction.type === TRANSACTION_TYPE.DEBT)
    .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
}

export function calculateTotalLiquidAssets(assets: Asset[]) {
  return assets
    .filter((asset) => {
      if (asset.type === "STOCK" || asset.type === "CRYPTO") return true;
      if (asset.type === "MUTUAL-FUND") return true;
      if (asset.type === "FIXED-DEPOSIT") return asset.isLiquid;
      return false;
    })
    .reduce((sum, asset) => sum + (asset.currentValue || 0), 0);
}
