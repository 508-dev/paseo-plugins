import { variableInput } from "../shared/environment";
import type { z } from "zod";

type VariableInput = z.infer<typeof variableInput>;
interface EditorActions {
  save(variable: VariableInput): Promise<void>;
}
interface EditorState {
  name: string;
  description: string;
  value: string;
  revision: number;
  status: "idle" | "pending" | "saved" | "error";
  message: "" | "invalidVariable" | "alreadyExists" | "saving" | "saveError" | { name: string };
}

export class EnvironmentEditor {
  private state: EditorState = {
    name: "",
    description: "",
    value: "",
    revision: 0,
    status: "idle",
    message: "",
  };
  private listeners = new Set<() => void>();
  constructor(private actions: EditorActions) {}
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<EditorState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  set(field: "name" | "description" | "value", value: string) {
    if (this.state.status === "pending") return;
    this.publish({ [field]: value, status: "idle", message: "" });
  }
  async save(existingNames: string[] = []) {
    if (this.state.status === "pending") return;
    const result = variableInput.safeParse(this.state);
    if (!result.success) {
      this.publish({
        status: "error",
        message: "invalidVariable",
      });
      return;
    }
    if (existingNames.includes(result.data.name)) {
      this.publish({
        status: "error",
        message: "alreadyExists",
      });
      return;
    }
    this.publish({
      status: "pending",
      value: "",
      revision: this.state.revision + 1,
      message: "saving",
    });
    try {
      await this.actions.save(result.data);
      this.publish({
        name: "",
        description: "",
        status: "saved",
        revision: this.state.revision + 1,
        message: { name: result.data.name },
      });
    } catch {
      this.publish({
        status: "error",
        message: "saveError",
      });
    }
  }
}
