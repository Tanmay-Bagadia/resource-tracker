import { parseInput } from "./parser.ts";

console.log("=== Testing the Traffic Cop Parser (with AI Fallback) ===\n");

const testCommands = [
  "- 150 food swiggy @ late night craving",
  'stock INFY 10 @1500 "Bought on dip"',
  'fd 200000 7.5% 1y SBI "Emergency Fund"',
  "+   50000   salary   techcorp",
  "STOCK hdfcbank 50 @1600",
  "I bought 15 shares of RELIANCE today at 2850 rupees each. It was a good dip.",
  "just ordered lunch on zomato for 450 bucks",
  "opened an fd at HDFC for 1.5 lakhs at 7.1% interest today",
  "my boss finally paid me my 80k bonus",
  "swiped my Regalia card for 3000 at starbucks",
];

async function runTests() {
  for (const cmd of testCommands) {
    try {
      console.log(`\nCommand: "${cmd}"`);
      const parsedData = await parseInput(cmd);
      console.log("Result:", parsedData);
      console.log("---------------------------------------------------");
    } catch (error: any) {
      console.error(`Error parsing "${cmd}":`, error.message);
      console.log("---------------------------------------------------");
    }
  }
}

runTests();
