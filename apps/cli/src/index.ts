#!/usr/bin/env node
/**
 * @module @resource-tracker/cli
 * Executable entrypoint for the resource-tracker CLI tool (`rt`).
 */

import { createCli } from "./cli.ts";
import { TrackerService } from "./service.ts";

export { createCli, TrackerService };

// If executed as script
if (
  process.argv[1]?.endsWith("cli/src/index.ts") ||
  process.argv[1]?.endsWith("/rt")
) {
  const cli = createCli();
  try {
    cli.parse(process.argv, { run: true });
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
