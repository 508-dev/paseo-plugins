import { variableInput, variableName } from "../shared/environment";
import type { Variable } from "./store";

export function parseBulkVariables(text: string): { variables: Variable[] } | { message: string } {
  const variables: Variable[] = [];
  const names = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = line.indexOf("=");
    const lineNumber = index + 1;
    const name = separator < 0 ? "" : line.slice(0, separator).trim();
    if (!variableName.safeParse(name).success) {
      return { message: `Line ${lineNumber}: use an uppercase NAME=value assignment.` };
    }
    const variable = variableInput.safeParse({
      name,
      value: line.slice(separator + 1),
      description: "",
    });
    if (!variable.success) {
      return {
        message: `Line ${lineNumber}: enter a nonempty value of up to 16,384 characters with no null characters.`,
      };
    }
    if (names.has(name)) return { message: `Line ${lineNumber}: ${name} appears more than once.` };
    names.add(name);
    variables.push(variable.data);
  }
  if (!variables.length) return { message: "Paste at least one NAME=value assignment." };
  return { variables };
}
