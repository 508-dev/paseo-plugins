interface ValueActions {
  read(): Promise<string>;
  copy(value: string): Promise<void>;
}
interface ValueState {
  revealed: string | null;
  pending: "reveal" | "copy" | null;
  message: "" | "autoHide" | "revealError" | "copied" | "copyError";
  status: "idle" | "success" | "error";
}

export class VariableValueController {
  private state: ValueState = { revealed: null, pending: null, message: "", status: "idle" };
  private listeners = new Set<() => void>();
  private generation = 0;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  constructor(private actions: ValueActions) {}
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<ValueState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  hide = () => {
    this.generation += 1;
    if (this.expiry) clearTimeout(this.expiry);
    this.expiry = null;
    this.publish({ revealed: null, pending: null, message: "", status: "idle" });
  };
  async reveal() {
    if (this.state.pending) return;
    const generation = ++this.generation;
    this.publish({ pending: "reveal", message: "", status: "idle" });
    try {
      const value = await this.actions.read();
      if (generation !== this.generation) return;
      this.publish({
        revealed: value,
        pending: null,
        message: "autoHide",
        status: "success",
      });
      this.expiry = setTimeout(this.hide, 30000);
    } catch {
      if (generation === this.generation)
        this.publish({
          pending: null,
          message: "revealError",
          status: "error",
        });
    }
  }
  async copy() {
    if (this.state.pending) return;
    const generation = ++this.generation;
    this.publish({ pending: "copy", message: "", status: "idle" });
    try {
      const value = await this.actions.read();
      if (generation !== this.generation) return;
      await this.actions.copy(value);
      if (generation === this.generation)
        this.publish({ pending: null, message: "copied", status: "success" });
    } catch {
      if (generation === this.generation)
        this.publish({
          pending: null,
          message: "copyError",
          status: "error",
        });
    }
  }
}
