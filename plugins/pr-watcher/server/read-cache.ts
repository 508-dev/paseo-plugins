import { readPullRequest, type PullRequestRef, type PullRequestSnapshot } from "./github.js";

export class ReadCache<T> {
  private readonly entries = new Map<string, { value: T; at: number }>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly capacity: number,
    private readonly now = Date.now,
  ) {}

  peek(key: string, maxAge: number): T | undefined {
    const entry = this.entries.get(key);
    if (!entry || this.now() - entry.at >= maxAge) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  read(key: string, maxAge: number, load: () => Promise<T>): Promise<T> {
    const cached = this.peek(key, maxAge);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const work = Promise.resolve()
      .then(load)
      .then((value) => {
        this.entries.delete(key);
        this.entries.set(key, { value, at: this.now() });
        const oldest = this.entries.keys().next();
        if (this.entries.size > this.capacity && !oldest.done) this.entries.delete(oldest.value);
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, work);
    return work;
  }
}

export function createPullRequestReader() {
  const snapshots = new ReadCache<PullRequestSnapshot>(128);
  return (ref: PullRequestRef, maxAge = 0) =>
    snapshots.read(ref.url.toLowerCase(), maxAge, () => readPullRequest(ref));
}

export type PullRequestReader = ReturnType<typeof createPullRequestReader>;
