/**
 * @module csv-parser
 * RFC 4180 compliant CSV parser with BOM handling and quote support.
 */

/**
 * Parse a CSV string into an array of records, using the first row as headers.
 *
 * Handles:
 * - Quoted fields (fields wrapped in double-quotes)
 * - Escaped quotes (doubled `""` inside quoted fields)
 * - Embedded commas and newlines inside quoted fields
 * - BOM (Byte Order Mark) stripping
 * - Whitespace trimming on headers and values
 *
 * @param content - Raw CSV string
 * @returns Array of records keyed by trimmed header names
 */
export function parseCSV(content: string): Record<string, string>[] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  // Strip BOM
  const cleaned = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  const rows = parseRows(cleaned);
  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0]!.map((h) => h.trim());
  if (headers.length === 0 || headers.every((h) => h === "")) {
    return [];
  }

  const result: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    // Skip completely empty rows
    if (row.length === 1 && row[0]!.trim() === "") {
      continue;
    }
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j]!;
      record[header] = (row[j] ?? "").trim();
    }
    result.push(record);
  }

  return result;
}

/**
 * Serialize an array of records back to a CSV string.
 *
 * @param rows - Array of records to serialize
 * @returns CSV string with headers as the first row
 */
export function serializeCSV(rows: Record<string, string>[]): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]!);
  const lines: string[] = [headers.map(escapeField).join(",")];

  for (const row of rows) {
    const values = headers.map((h) => escapeField(row[h] ?? ""));
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

/**
 * Escape a field value for CSV serialization.
 * Wraps in quotes if the value contains a comma, double-quote, or newline.
 */
function escapeField(value: string): string {
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Parse CSV content into a 2D array of strings (rows × fields).
 * Implements RFC 4180 state machine for proper quote handling.
 */
function parseRows(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i]!;

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote (doubled quote)
        if (i + 1 < content.length && content[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        i++;
      } else if (char === "\r") {
        // Handle \r\n and bare \r
        currentRow.push(currentField);
        currentField = "";
        if (i + 1 < content.length && content[i + 1] === "\n") {
          i += 2;
        } else {
          i++;
        }
        rows.push(currentRow);
        currentRow = [];
      } else if (char === "\n") {
        currentRow.push(currentField);
        currentField = "";
        i++;
        rows.push(currentRow);
        currentRow = [];
      } else {
        currentField += char;
        i++;
      }
    }
  }

  // Push the last field and row if there's remaining content
  if (currentField !== "" || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}
