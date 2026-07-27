import { TRANSACTION_TYPE } from "../../core-types/src/index.ts";
import type {
  Transaction,
  Asset,
  Liability,
  StockAsset,
  FDAsset,
  CreditCard,
  CryptoAsset,
  ESOPAsset,
  Loan,
  PPFAsset,
  MutualFundAsset,
} from "../../core-types/src/index.ts";
import { parseWithLocalLLM } from "./nlp.ts";

// ============================================================================
// TODO (Phase 5 - Market Data Integration):
// Currently, these parsers return Partial<Asset> because they cannot fetch
// real-time market data (like currentPrice) and must leave those fields blank.
//
// REFACTOR THIS ENTIRE FILE in Phase 5 to implement the "Intent Pattern".
// These functions should NOT return Partial Assets. They should return strict
// Intent objects (e.g., CreateStockIntent). A separate AssetService will take
// those Intents, fetch real market data via APIs, and construct the final Asset.
// ============================================================================

export async function parseInput(command: string) {
  try {
    const firstWord = command.trim().split(" ")[0].toLowerCase();
    switch (firstWord) {
      case "stock":
        return parseStock(command);
      case "fd":
        return parseFD(command);
      case "mf":
        return parseMutualFund(command);
      case "crypto":
        return parseCrypto(command);
      case "esop":
        return parseESOP(command);
      case "loan":
        return parseLoan(command);
      case "cc":
        return parseCreditCard(command);
      case "ppf":
        return parsePPF(command);
      default:
        return parseTransaction(command);
    }
  } catch (regexError) {
    console.log(`[Parser] Strict regex failed. Routing to Ollama NLP...`);
    try {
      return await parseWithLocalLLM(command);
    } catch (llmError) {
      throw new Error(
        `Failed to understand input via strict formatting or NLP.`
      );
    }
  }
}

function parseTransaction(command: string): Partial<Transaction> {
  command = command.replace(/\s+/g, " ").trim();

  const transaction: Partial<Transaction> = {};
  transaction.type =
    command[0] == "+" ? TRANSACTION_TYPE.CREDIT : TRANSACTION_TYPE.DEBT;
  const tokens = command.split("@");
  const coreCommand = tokens[0].trim().split(" ");

  if (coreCommand[0] === "+" || coreCommand[0] === "-") {
    coreCommand.shift();
  }

  if (tokens[1]) {
    transaction.desc = tokens[1].trim();
  }
  const parsedAmount = Math.abs(parseFloat(coreCommand[0]));
  if (Number.isNaN(parsedAmount)) {
    throw new Error("Invalid amount. Please provide a valid number.");
  }
  const category = coreCommand[1];
  const merchant = coreCommand.slice(2).join(" ");

  if (category == undefined) {
    throw new Error("Missing category");
  }

  if (merchant == "") {
    throw new Error("Missing merchant");
  }

  transaction.amount = parsedAmount;
  transaction.category = category;
  transaction.merchant = merchant;

  transaction.timestampMs = Date.now();
  transaction.id = crypto.randomUUID();

  return transaction;
}

function parseStock(command: string): Partial<StockAsset & Asset> {
  const regex =
    /^stock\s+(?<ticker>[A-Za-z0-9]+)\s+(?<quantity>\d+(?:\.\d+)?)\s*@\s*(?<price>\d+(?:\.\d+)?)(?:\s+(?<notes>.*))?$/i;
  const match = command.match(regex);
  if (!match?.groups)
    throw new Error(
      "Invalid Stock format! Expected: stock <ticker> <quantity> @<price>"
    );

  const stock: Partial<StockAsset & Asset> = {
    type: "STOCK",
    ticker: match.groups.ticker.trim(),
    quantity: Math.abs(parseFloat(match.groups.quantity)),
    avgBuyPrice: Math.abs(parseFloat(match.groups.price)),
  };

  if (match.groups.notes)
    stock.notes = match.groups.notes.replace(/^["']|["']$/g, "").trim();
  return stock;
}
function parseFD(command: string): Partial<FDAsset & Asset> {
  const regex =
    /^fd\s+(?<principal>\d+(?:\.\d+)?)\s+(?<rate>\d+(?:\.\d+)?)%\s+(?<tenure>\d+[ymd])\s+(?<bank>.+?)(?:\s+(?<notes>.*))?$/i;
  const match = command.match(regex);
  if (!match?.groups)
    throw new Error(
      "Invalid FD format! Expected: fd <principal> <rate>% <tenure> <bank>"
    );

  const fd: Partial<FDAsset & Asset> = {
    type: "FIXED-DEPOSIT",
    principal: Math.abs(parseFloat(match.groups.principal)),
    interestRate: Math.abs(parseFloat(match.groups.rate)),
    bankName: match.groups.bank.trim(),
  };
  if (match.groups.notes)
    fd.notes = match.groups.notes.replace(/^["']|["']$/g, "").trim();
  // Note: match.groups.tenure string (e.g. "1y") needs to be converted to maturityDate in the Service layer
  return fd;
}

function parseMutualFund(command: string): Partial<MutualFundAsset & Asset> {
  const regex =
    /^mf\s+(?<schemeName>.+?)\s+(?<units>\d+(?:\.\d+)?)\s*@\s*(?<nav>\d+(?:\.\d+)?)(?:\s+(?<notes>.*))?$/i;
  const match = command.match(regex);
  if (!match?.groups)
    throw new Error(
      "Invalid MF format! Expected: mf <schemeName> <units> @<nav>"
    );

  const mf: Partial<MutualFundAsset & Asset> = {
    type: "MUTUAL-FUND",
    schemeName: match.groups.schemeName.trim(),
    units: Math.abs(parseFloat(match.groups.units)),
    avgNav: Math.abs(parseFloat(match.groups.nav)),
  };
  if (match.groups.notes)
    mf.notes = match.groups.notes.replace(/^["']|["']$/g, "").trim();
  return mf;
}

function parseESOP(command: string): Partial<ESOPAsset & Asset> {
  const regex =
    /^esop\s+(?<company>.+?)\s+(?<granted>\d+(?:\.\d+)?)\s*@\s*(?<strikePrice>\d+(?:\.\d+)?)(?:\s+(?<notes>.*))?$/i;
  const match = command.match(regex);
  if (!match?.groups)
    throw new Error(
      "Invalid ESOP format! Expected: esop <company> <granted> @<strikePrice>"
    );

  const esop: Partial<ESOPAsset & Asset> = {
    type: "ESOP",
    companyName: match.groups.company.trim(),
    totalGranted: Math.abs(parseFloat(match.groups.granted)),
    strikePrice: Math.abs(parseFloat(match.groups.strikePrice)),
  };
  if (match.groups.notes)
    esop.notes = match.groups.notes.replace(/^["']|["']$/g, "").trim();
  return esop;
}

function parseCrypto(command: string): Partial<CryptoAsset & Asset> {
  const regex =
    /^crypto\s+(?<token>[A-Za-z0-9]+)\s+(?<quantity>\d+(?:\.\d+)?)\s*@\s*(?<price>\d+(?:\.\d+)?)(?:\s+(?<notes>.*))?$/i;
  const match = command.match(regex);
  if (!match?.groups)
    throw new Error(
      "Invalid Crypto format! Expected: crypto <token> <quantity> @<price>"
    );

  const crypto: Partial<CryptoAsset & Asset> = {
    type: "CRYPTO",
    token: match.groups.token.trim(),
    quantity: Math.abs(parseFloat(match.groups.quantity)),
    avgBuyPrice: Math.abs(parseFloat(match.groups.price)),
  };
  if (match.groups.notes)
    crypto.notes = match.groups.notes.replace(/^["']|["']$/g, "").trim();
  return crypto;
}

function parseLoan(command: string): Partial<Loan & Liability> {
  const regex =
    /^loan\s+(?<principal>\d+(?:\.\d+)?)\s+(?<rate>\d+(?:\.\d+)?)%\s+(?<tenure>\d+m)\s+(?<type>.+?)(?:\s+(?<notes>.*))?$/i;
  const match = command.match(regex);
  if (!match?.groups)
    throw new Error(
      "Invalid Loan format! Expected: loan <principal> <rate>% <tenure_months>m <loanType>"
    );

  const loan: Partial<Loan & Liability> = {
    type: "LOAN",
    principalAmount: Math.abs(parseFloat(match.groups.principal)),
    interestRate: Math.abs(parseFloat(match.groups.rate)),
    tenureMonths: parseInt(match.groups.tenure.replace("m", "")),
    loanType: match.groups.type.trim(),
  };
  if (match.groups.notes)
    loan.notes = match.groups.notes.replace(/^["']|["']$/g, "").trim();
  return loan;
}

function parseCreditCard(command: string): Partial<CreditCard & Liability> {
  const regex =
    /^cc\s+(?<balance>\d+(?:\.\d+)?)\s*\/\s*(?<limit>\d+(?:\.\d+)?)\s*@\s*(?<rate>\d+(?:\.\d+)?)%\s+(?<bankInfo>.+?)(?:\s+(?<notes>.*))?$/i;
  const match = command.match(regex);
  if (!match?.groups)
    throw new Error(
      "Invalid Credit Card format! Expected: cc <balance>/<limit> @<rate>% <bankName>"
    );

  const cc: Partial<CreditCard & Liability> = {
    type: "CREDIT-CARD",
    currentBalance: Math.abs(parseFloat(match.groups.balance)),
    creditLimit: Math.abs(parseFloat(match.groups.limit)),
    interestRate: Math.abs(parseFloat(match.groups.rate)),
    bankName: match.groups.bankInfo.trim(),
  };
  if (match.groups.notes)
    cc.notes = match.groups.notes.replace(/^["']|["']$/g, "").trim();
  return cc;
}

function parsePPF(command: string): Partial<PPFAsset & Asset> {
  const regex =
    /^ppf\s+(?<balance>\d+(?:\.\d+)?)\s+(?<rate>\d+(?:\.\d+)?)%(?:\s+(?<notes>.*))?$/i;
  const match = command.match(regex);
  if (!match?.groups)
    throw new Error("Invalid PPF format! Expected: ppf <balance> <rate>%");

  const ppf: Partial<PPFAsset & Asset> = {
    type: "PPF",
    currentBalance: Math.abs(parseFloat(match.groups.balance)),
    interestRate: Math.abs(parseFloat(match.groups.rate)),
  };
  if (match.groups.notes)
    ppf.notes = match.groups.notes.replace(/^["']|["']$/g, "").trim();
  return ppf;
}
