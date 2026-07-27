import { parseInput } from "./parser.ts";

console.log("=== Testing the Traffic Cop Parser ===\n");

const testCommands = [
  //  Regular transaction
  "- 150 food swiggy @ late night craving",
  "+ 50000 salary techcorp",

  //  Stock
  'stock INFY 10 @1500 "Bought on dip"',

  //  FD
  'fd 200000 7.5% 1y SBI "Emergency Fund"',

  // Mutual Fund
  "mf PPFAS 50.5 @120",

  // Crypto
  "crypto BTC 0.05 @2500000",

  // 6. ESOP
  "esop Razorpay 1000 @100",
  
  // 7. PPF
  "ppf 450000 7.1%",
  
  // 8. Loan
  "loan 500000 9% 36m home",
  
  // 9. Credit Card
  "cc 35000/200000 @36% HDFC Regalia",
];

testCommands.forEach((cmd) => {
  try {
    console.log(`Command: "${cmd}"`);
    const parsedData = parseInput(cmd);
    console.log("Result:", parsedData);
    console.log("---------------------------------------------------");
  } catch (error: any) {
    console.error(`Error parsing "${cmd}":`, error.message);
    console.log("---------------------------------------------------");
  }
});
