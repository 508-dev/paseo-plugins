import type { PluginComposer } from "@getpaseo/plugin/client";

interface Destination {
  title: string;
  composer?(): PluginComposer | undefined;
}

// The screen is remounted from a different installation when the app host
// picker changes. Keep the destination tied to the command that opened it.
// Only an opaque key goes in the screen URL. The registry holds composer callbacks.
const key = Symbol.for("508-dev.agent-context.destinations");
const app = globalThis as typeof globalThis & {
  [key]?: { next: number; targets: Map<string, Destination> };
};
const registry = (app[key] ??= { next: 0, targets: new Map() });

export function createDestinationRegistration() {
  let active: string | undefined;
  function clear() {
    if (active) registry.targets.delete(active);
    active = undefined;
  }
  return {
    set(destination: Destination): string {
      clear();
      active = String(++registry.next);
      registry.targets.set(active, destination);
      return active;
    },
    clear,
  };
}

export function getDestination(destinationKey: string | undefined): Destination | undefined {
  return destinationKey === undefined ? undefined : registry.targets.get(destinationKey);
}
