import { parseInput } from "./parser.ts";

console.log("=== Testing the Traffic Cop Parser (with AI Fallback) ===\n");

const testCommands = [
  // --- 1. STRICT REGEX TESTS (Should parse instantly without AI) ---
  "- 150 food swiggy @ late night craving",
  "stock INFY 10 @1500 \"Bought on dip\"",
  "fd 200000 7.5% 1y SBI \"Emergency Fund\"",
  
  // --- 2. EDGY STRICT TESTS (Testing spaces and case sensitivity) ---
  "+   50000   salary   techcorp", // Crazy spaces
  "STOCK hdfcbank 50 @1600", // All caps
  
  // --- 3. NATURAL LANGUAGE TESTS (Should fail regex, route to AI, and succeed) ---
  "I bought 15 shares of RELIANCE today at 2850 rupees each. It was a good dip.",
  "just ordered lunch on zomato for 450 bucks",
  "opened an fd at HDFC for 1.5 lakhs at 7.1% interest today",
  
  // --- 4. EXTREME EDGE CASES (AI Stress Test) ---
  "my boss finally paid me my 80k bonus", // Implicit credit transaction
  "swiped my Regalia card for 3000 at starbucks", // Implicit debit transaction
];

async function runTests() {
  for (const cmd of testCommands) {
    try {
      console.log(`\nCommand: "${cmd}"`);
      
      // We must AWAIT because the parser might hit Ollama!
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
