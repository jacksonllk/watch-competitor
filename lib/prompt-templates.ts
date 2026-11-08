import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Templates } from "./prompt";

/** Reads the editable templates from prompts/<kind>.txt. */
export function loadTemplates(dir = join(process.cwd(), "prompts")): Templates {
  const read = (kind: string) => readFileSync(join(dir, `${kind}.txt`), "utf8");
  return { pricing: read("pricing"), changelog: read("changelog"), news: read("news") };
}
