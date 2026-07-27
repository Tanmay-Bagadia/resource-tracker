export const TRANSACTION_TYPE = { DEBT: "DEBT", CREDIT: "CREDIT" } as const;

export type TransactionType =
  typeof TRANSACTION_TYPE[keyof typeof TRANSACTION_TYPE];

export interface Transaction {
  id: string;
  type: TransactionType;
  category: string;
  amount: number;
  merchant: string;
  timestampMs: number;
  desc?: string;
}

export type StockAsset = {
  type: "STOCK";
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  ticker: string;
  exchange: string;
};

export type FDAsset = {
  type: "FIXED-DEPOSIT";
  principal: number;
  interestRate: number;
  compoundFrequency: string;
  startDate: Date;
  maturityDate: Date;
  bankName: string;
  isLiquid: boolean;
};

export type MutualFundAsset = {
  type: "MUTUAL-FUND";
  schemeName: string;
  schemeCode: number;
  folioNumber: number;
  units: number;
  avgNav: number;
  currentNav: number;
  sipAmount: number;
};

export type VestingEvent = {
  date: Date | Date[];
  amount: number | number[];
  note?: string;
};

export type ESOPAsset = {
  type: "ESOP";
  companyName: string;
  grantDate: Date;
  totalGranted: number;
  vested: number;
  unvested: number;
  vestingSchedule: VestingEvent[];
  strikePrice: number;
  currentPricePerShare?: number;
  isListed: boolean;
};

export type CryptoAsset = {
  type: "CRYPTO";
  token: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  walletType?: string;
};

export type PPFAsset = {
  type: "PPF";
  accountNumber?: string;
  totalDeposited: number;
  currentBalance: number;
  interestRate: number;
  openDate: Date;
  maturityDate: Date;
  financialYearDeposits: number;
};

export type Asset = {
  id: string;
  ownerId: string;
  name: string;
  institutionName: string;
  currency: string;
  currentValue: number;
  totalInvestedAmount: number;
  lastValuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
} & (
  | StockAsset
  | FDAsset
  | MutualFundAsset
  | ESOPAsset
  | CryptoAsset
  | PPFAsset
);

export type Loan = {
  type: "LOAN";
  loanType: string;
  principalAmount: number;
  interestRate: number;
  emi: number;
  tenureMonths: number;
  remainingMonths: number;
  startDate: Date;
  lenderName: string;
};

export type CreditCard = {
  type: "CREDIT-CARD";
  bankName: string;
  cardName?: string;
  creditLimit: number;
  dueDate?: Date;
  minpayment?: number;
  interestRate: number;
};

export type Liability = {
  id: string;
  currentBalance: number;
  createdAt: Date;
  updatedAt: Date;
  notes?: string;
} & (Loan | CreditCard);

export interface Budget {
  id: string;
  category: string;
  limit: number;
  period: "weekly" | "monthly";
  spent: number;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: Date;
  linkedAssetIds: string[];
}

export interface NetWorthSnapshot {
  id: string;
  timestampMs: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

export interface FinancialHealth {
  runwayMonths: number;
  savingsRate: number;
  healthyEmergencyFund: boolean;
  debtToAssetRatio: number;
}

export type UpdatePayload<T> = {
  [P in keyof T]?: T[P];
};

export type DeepReadOnly<T> = {
  readonly [P in keyof T]: T[P] extends (infer U)[]
    ? ReadonlyArray<DeepReadOnly<U>>
    : T[P] extends object
    ? DeepReadOnly<T[P]>
    : T[P];
};
