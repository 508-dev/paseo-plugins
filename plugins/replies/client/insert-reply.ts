import type { PluginComposer } from "@getpaseo/plugin/client";

export class ReplyInsertError extends Error {
  constructor(
    readonly key: "noComposer" | "clearDraft" | "newTurn" | "staleSuggestion",
    message: string,
  ) {
    super(message);
  }
}

export async function insertReply(
  composer: Pick<PluginComposer, "prompt" | "setPrompt" | "focus"> | undefined,
  text: string,
): Promise<void> {
  if (!composer) throw new ReplyInsertError("noComposer", "This agent's composer is unavailable.");
  if (composer.prompt.trim())
    throw new ReplyInsertError(
      "clearDraft",
      "Clear your draft before inserting a suggested reply.",
    );
  composer.setPrompt(text);
  await composer.focus({ selection: { start: text.length, end: text.length } });
}
