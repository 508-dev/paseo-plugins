import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  type CopyStatus,
  proxyRoute,
  variableInput,
  variableMetadata,
} from "../shared/environment";

const execFileAsync = promisify(execFile);
// A plugin version that predates IronProxy must fail closed on a protected record.
const storedProxyVariable = variableMetadata
  .extend({ proxyUrl: proxyRoute, proxyValue: variableInput.shape.value })
  .strict()
  .transform(({ proxyValue, ...metadata }) => ({ ...metadata, value: proxyValue }));
const documentSchema = z.object({
  variables: z.array(z.union([storedProxyVariable, variableInput])).max(256),
});
const metadataDocumentSchema = z.object({
  directory: z.string().optional(),
  variables: z.array(variableMetadata).max(256),
});
export interface StoredProjectMetadata {
  scopeId: string;
  directory: string | null;
  variables: z.infer<typeof variableMetadata>[];
}
export type Variable = z.infer<typeof variableInput>;
export interface ProjectScope {
  id: string;
  cwd: string;
}

type StorageKey = { id: string; projectScopeId?: string };
type StorageScope = StorageKey & ProjectScope;

export async function projectScope(directory: string): Promise<ProjectScope> {
  const cwd = await realpath(directory);
  let identity = cwd;
  try {
    const result = await execFileAsync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd, timeout: 5000 },
    );
    identity = await realpath(result.stdout.trim());
  } catch (error) {
    // A non-Git directory gets its own scope. Other failures must not silently change scope.
    const notRepository =
      error instanceof Error &&
      "stderr" in error &&
      String(error.stderr).includes("not a git repository");
    if (!notRepository)
      throw new Error("Cannot resolve project environment scope", { cause: error });
  }
  return { id: createHash("sha256").update(identity).digest("hex"), cwd };
}

export async function workspaceScope(project: ProjectScope): Promise<StorageScope> {
  let cwd = project.cwd;
  // Paseo groups directories within a Git checkout into a single workspace.
  // Resolve from the saved command directory so existing agent URLs inherit overrides.
  if (createHash("sha256").update(cwd).digest("hex") !== project.id) {
    const result = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      timeout: 5000,
    });
    cwd = await realpath(result.stdout.replace(/\r?\n$/, ""));
  }
  return {
    id: createHash("sha256").update(cwd).digest("hex"),
    projectScopeId: project.id,
    cwd,
  };
}

export async function privateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
}

export async function privateWrite(file: string, value: unknown): Promise<void> {
  await privateDirectory(path.dirname(file));
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    // Parser errors can include stored secret values. Never attach them to an RPC error.
    // oxlint-disable-next-line preserve-caught-error
    throw new Error("Cannot read project environment storage");
  }
}

export class EnvironmentStore {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}

  private file(scope: StorageKey): string {
    return scope.projectScopeId
      ? path.join(this.directory, "workspaces", scope.projectScopeId, `${scope.id}.json`)
      : path.join(this.directory, `${scope.id}.json`);
  }

  async read(scope: StorageKey): Promise<Variable[]> {
    const data = await readJson(this.file(scope));
    if (data === null) return [];
    const result = documentSchema.safeParse(data);
    if (!result.success) throw new Error("Project environment storage is invalid");
    return result.data.variables;
  }

  async readWorkspace(project: ProjectScope) {
    const scope = await workspaceScope(project);
    return this.read(scope);
  }

  async readEffective(project: ProjectScope) {
    const [defaults, overrides] = await Promise.all([
      this.read(project),
      this.readWorkspace(project),
    ]);
    const values = new Map(defaults.map((variable) => [variable.name, variable]));
    for (const variable of overrides) values.set(variable.name, variable);
    return {
      variables: [...values.values()].toSorted((a, b) => a.name.localeCompare(b.name)),
      secrets: [...defaults, ...overrides].map(({ value }) => value),
    };
  }

  async readValue(scope: StorageKey, name: string): Promise<string> {
    const variable = (await this.read(scope)).find((entry) => entry.name === name);
    if (!variable) throw new Error("The saved variable is no longer available");
    if (variable.proxyUrl) throw new Error("This credential is only available through IronProxy.");
    return variable.value;
  }

  async catalogue(): Promise<StoredProjectMetadata[]> {
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw new Error("Cannot list saved project variables", { cause: error });
    }
    const entries: StoredProjectMetadata[] = [];
    for (const file of files.toSorted()) {
      if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
      const document = await readJson(path.join(this.directory, file));
      if (document === null) continue;
      // This projection strips values before anything enters the searchable catalogue.
      const parsed = metadataDocumentSchema.safeParse(document);
      if (!parsed.success) throw new Error("Saved variable metadata is invalid");
      if (!parsed.data.variables.length) continue;
      entries.push({
        scopeId: file.slice(0, -5),
        directory: parsed.data.directory ?? null,
        variables: parsed.data.variables,
      });
    }
    return entries;
  }

  async save(scope: StorageScope, variable: Variable): Promise<void> {
    const parsed = variableInput.safeParse(variable);
    if (!parsed.success) throw new Error("Invalid environment variable");
    return this.change(scope, (variables) => {
      const next = variables.filter((entry) => entry.name !== variable.name);
      if (next.length >= 256) throw new Error("A scope can have at most 256 variables");
      const previous = variables.find((entry) => entry.name === variable.name);
      const { description, value } = parsed.data;
      // Existing route policies are changed together through configureProxy.
      const entry = previous ? { ...previous, description, value } : parsed.data;
      return [...next, entry].toSorted((a, b) => a.name.localeCompare(b.name));
    });
  }

  async saveMany(scope: StorageScope, additions: Variable[], overwriteNames: string[]) {
    return this.enqueue(async () => {
      const variables = await this.read(scope);
      const next = new Map(variables.map((variable) => [variable.name, variable]));
      const approved = new Set(overwriteNames);
      const conflicts = additions.filter(({ name }) => next.has(name));
      if (conflicts.length !== approved.size || conflicts.some(({ name }) => !approved.has(name))) {
        return {
          status: "rejected",
          message: "Saved variables changed. Review the current preview before trying again.",
        } as const;
      }
      for (const variable of additions) {
        const existing = next.get(variable.name);
        next.set(variable.name, existing ? { ...existing, value: variable.value } : variable);
      }
      if (next.size > 256) {
        return {
          status: "rejected",
          message: "This scope can have at most 256 variables.",
        } as const;
      }
      await this.write(
        scope,
        [...next.values()].toSorted((a, b) => a.name.localeCompare(b.name)),
      );
      return {
        status: "saved",
        added: next.size - variables.length,
        updated: conflicts.length,
      } as const;
    });
  }

  async configureProxy(
    scope: StorageKey & { cwd?: string },
    name: string,
    expected: string | null,
    url: string | null,
    previousRequests: NonNullable<Variable["requests"]> = [],
    requests: NonNullable<Variable["requests"]> = [],
    previousMethod: NonNullable<Variable["proxyMethod"]> = "GET",
    method: NonNullable<Variable["proxyMethod"]> = "GET",
  ) {
    return this.enqueue(async () => {
      const document = await readJson(this.file(scope));
      const directory = z.object({ directory: z.string().optional() }).parse(document).directory;
      const variables = await this.read(scope);
      const entry = variables.find((v) => v.name === name);
      if (
        !entry ||
        (entry.proxyUrl ?? null) !== expected ||
        (entry.proxyMethod ?? "GET") !== previousMethod ||
        JSON.stringify(entry.requests ?? []) !== JSON.stringify(previousRequests)
      )
        throw new Error("Credential changed. Refresh and retry.");
      entry.requests = url && requests.length ? requests : undefined;
      entry.proxyUrl = url ?? undefined;
      entry.proxyMethod = url && method !== "GET" ? method : undefined;
      await this.write({ ...scope, cwd: directory }, variables);
    });
  }

  async remove(scope: StorageScope, name: string): Promise<void> {
    return this.change(scope, (variables) => variables.filter((entry) => entry.name !== name));
  }

  async copy(
    source: StorageKey,
    destination: StorageScope,
    name: string,
    overwrite = false,
  ): Promise<CopyStatus> {
    if (this.file(source) === this.file(destination)) return "same-scope";
    return this.enqueue(async () => {
      const variable = (await this.read(source)).find((entry) => entry.name === name);
      if (!variable) return "missing";
      const variables = await this.read(destination);
      const existing = variables.findIndex((entry) => entry.name === name);
      if (existing !== -1) {
        if (!overwrite) return "exists";
        variables[existing] = variable;
        await this.write(destination, variables);
        return "overwritten";
      }
      if (variables.length >= 256) return "full";
      await this.write(
        destination,
        [...variables, variable].toSorted((a, b) => a.name.localeCompare(b.name)),
      );
      return "copied";
    });
  }

  private change(
    scope: StorageScope,
    update: (variables: Variable[]) => Variable[],
  ): Promise<void> {
    return this.enqueue(async () => {
      const variables = update(await this.read(scope));
      await this.write(scope, variables);
    });
  }

  private write(scope: StorageKey & { cwd?: string }, variables: Variable[]) {
    const records = variables.map(({ value, ...metadata }) =>
      metadata.proxyUrl ? { ...metadata, proxyValue: value } : { ...metadata, value },
    );
    return privateWrite(this.file(scope), { directory: scope.cwd, variables: records });
  }

  private enqueue<T>(operation: () => Promise<T>) {
    const write = this.writes.then(operation);
    this.writes = write.catch(() => {});
    return write;
  }
}
