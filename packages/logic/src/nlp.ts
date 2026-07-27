const SYSTEM_PROMPT = `
You are an expert financial data extraction API. 
Your ONLY job is to take the user's natural language input and output a strict JSON object. Do NOT output any conversational text.

Depending on the user's input, the JSON must match one of these structures exactly:

1. Transaction (for expenses/incomes):
{ "intent": "TRANSACTION", "type": "DEBT" | "CREDIT", "amount": number, "category": string, "merchant": string, "desc": string }

2. Stock Asset:
{ "intent": "STOCK", "ticker": string, "quantity": number, "avgBuyPrice": number, "notes": string }

3. Fixed Deposit:
{ "intent": "FIXED-DEPOSIT", "principal": number, "interestRate": number, "bankName": string, "notes": string }

EXAMPLES:
Input: "I spent 150 on swiggy for late night cravings"
Output: { "intent": "TRANSACTION", "type": "DEBT", "amount": 150, "category": "food", "merchant": "swiggy", "desc": "late night cravings" }

Input: "Bought 10 shares of INFY at 1500"
Output: { "intent": "STOCK", "ticker": "INFY", "quantity": 10, "avgBuyPrice": 1500, "notes": "" }
`.trim();

async function fetchOllamaWithTimeout(
  prompt: string,
  timeoutMs: number = 5000
) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "qwen2.5:7b",
        prompt: prompt,
        system: SYSTEM_PROMPT,
        stream: false,
        format: "json",
      }),
    });
    const data = await response.json();
    return data.response;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error(
        "Ollama took too long to respond. Falling back to strict parser."
      );
    }
    if (error.cause?.code === "ECONNREFUSED") {
      throw new Error("Ollama is not running. Falling back to strict parser.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function parseWithLocalLLM(command: string) {
  try {
    console.log(`[NLP] Asking Ollama to parse: "${command}"...`);
    const rawJsonString = await fetchOllamaWithTimeout(command);
    const parsedData = JSON.parse(rawJsonString);
    return parsedData;
  } catch (error: any) {
    console.error("[NLP] Failed to parse with LLM:", error);
    throw error;
  }
}
