import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import path from "node:path";
import { z } from "zod";
import { execute, executionInput, ProxyOnlyError } from "./execute";
import { EnvironmentStore, privateWrite, readJson, type ProjectScope } from "./store";

import { proxyRequest, ProxySetupError } from "./ironproxy";
import { allowedRequest, type AllowedRequest, variableName } from "../shared/environment";

const brokerState = z.object({
  port: z.number().int().min(1).max(65535),
  bindings: z
    .array(
      z.object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        scope: z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), cwd: z.string() }),
      }),
    )
    .max(4096),
});
type BrokerState = z.infer<typeof brokerState>;
export const toolInstructions =
  "Use project_environment_list to discover available variable names and descriptions. For credentials marked IronProxy, use project_environment_request with the name. For commands needing ordinary variables, use project_environment_run and request only the variable names needed. Reference values through environment variables in code; never put values in tool arguments, source files, chat, or logs. Do not print or encode credentials. Commands have host filesystem/network access and can perform actions allowed by the credentials. Values are read fresh on every execution.";

export class EnvironmentBroker {
  private server: Server | null = null;
  private state: BrokerState = { port: 1, bindings: [] };
  private changes: Promise<unknown> = Promise.resolve();
  private lifetime = new AbortController();
  private active = 0;
  private transports = new Set<StreamableHTTPServerTransport>();
  readonly store: EnvironmentStore;

  constructor(private directory: string) {
    this.store = new EnvironmentStore(path.join(directory, "projects"));
  }

  private drafts = new Map<string, AllowedRequest[]>();
  proposals(cwd: string, scope: string, name: string) {
    return this.drafts.get(JSON.stringify([cwd, scope, name])) ?? [];
  }
  async start(): Promise<void> {
    if (process.platform === "win32")
      throw new Error("Project environment requires a macOS or Linux daemon");
    const stored = await readJson(path.join(this.directory, "broker.json"));
    const parsed = brokerState.safeParse(stored);
    if (stored !== null && !parsed.success)
      throw new Error("Environment broker storage is invalid");
    if (parsed.success) this.state = parsed.data;
    const port = stored === null ? 0 : this.state.port;
    const server = createServer((request, response) => {
      const binding = this.state.bindings.find((entry) => request.url === `/mcp/${entry.token}`);
      const validHost = request.headers.host === `127.0.0.1:${this.state.port}`;
      if (!binding || !validHost || request.headers.origin) {
        response.writeHead(403).end();
        return;
      }
      if (request.method !== "POST") {
        response.writeHead(405, { Allow: "POST" }).end();
        return;
      }
      if (this.active >= 4) {
        response.writeHead(429).end();
        return;
      }
      this.active += 1;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      this.transports.add(transport);
      const mcp = new McpServer(
        { name: "project-environment", version: "0.1.0" },
        { instructions: toolInstructions },
      );
      mcp.registerTool(
        "project_environment_list",
        {
          description:
            "List available environment variable names and descriptions for this workspace. Never returns values. " +
            toolInstructions,
          inputSchema: z.object({}).strict(),
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => {
          const { variables } = await this.store.readEffective(binding.scope);
          const metadata = variables.map(({ name, description, proxyUrl, requests }) =>
            proxyUrl
              ? {
                  name,
                  description,
                  mode: "ironproxy",
                  method: "GET",
                  url: proxyUrl,
                  operations: [
                    { id: "default", method: "GET", url: proxyUrl },
                    ...(requests ?? []),
                  ],
                  usage:
                    "Use project_environment_request with this name and operation ID. To suggest another operation use project_environment_propose_request, then ask the user to approve it in Protected settings. IronProxy supplies the Authorization header.",
                }
              : { name, description },
          );
          return { content: [{ type: "text", text: JSON.stringify({ variables: metadata }) }] };
        },
      );
      mcp.registerTool(
        "project_environment_run",
        {
          description:
            "Run a shell command in this workspace with named environment variables injected from current storage. Use for API calls and SDK scripts requiring credentials. " +
            toolInstructions,
          inputSchema: executionInput,
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
          },
        },
        async (input, extra) => {
          const controller = new AbortController();
          function cancel() {
            controller.abort();
          }
          this.lifetime.signal.addEventListener("abort", cancel, { once: true });
          extra.signal.addEventListener("abort", cancel, { once: true });
          if (this.lifetime.signal.aborted || extra.signal.aborted) cancel();
          try {
            const signal = controller.signal;
            const result = await execute({
              store: this.store,
              scope: binding.scope,
              input,
              signal,
            });
            const isError = result.exitCode !== 0 || result.stopped !== null;
            return { content: [{ type: "text", text: JSON.stringify(result) }], isError };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    error instanceof ProxyOnlyError
                      ? error.message
                      : "Environment command failed. Check the selected variable names and workspace availability.",
                },
              ],
              isError: true,
            };
          } finally {
            this.lifetime.signal.removeEventListener("abort", cancel);
            extra.signal.removeEventListener("abort", cancel);
          }
        },
      );
      mcp.registerTool(
        "project_environment_request",
        {
          description:
            "Call an approved operation by ID. Omit operation for the default GET. For write operations body may be a JSON string.",
          inputSchema: z
            .object({
              name: variableName,
              operation: z.string().max(64).default("default"),
              body: z.string().max(65536).optional(),
            })
            .strict(),
        },
        async ({ name, operation, body }, extra) => {
          try {
            const { variables, secrets } = await this.store.readEffective(binding.scope);
            const credential = variables.find((v) => v.name === name);
            if (!credential?.proxyUrl)
              return {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "No IronProxy route is configured for this name in this workspace.",
                  },
                ],
              };
            const selected =
              operation === "default"
                ? { method: "GET", url: credential.proxyUrl }
                : credential.requests?.find((r) => r.id === operation);
            if (!selected || (selected.method === "GET" && body !== undefined))
              return {
                isError: true,
                content: [{ type: "text", text: "Request is outside the approved operation." }],
              };
            if (body !== undefined) JSON.parse(body);
            const result = await proxyRequest(
              selected.url,
              credential.value,
              secrets,
              AbortSignal.any([extra.signal, this.lifetime.signal]),
              selected.method,
              body,
            );
            return {
              isError: result.status >= 400,
              content: [{ type: "text", text: JSON.stringify(result) }],
            };
          } catch (error) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text:
                    error instanceof ProxySetupError
                      ? error.message
                      : "IronProxy request failed. Check the approved endpoint and proxy availability.",
                },
              ],
            };
          }
        },
      );
      mcp.registerTool(
        "project_environment_propose_request",
        {
          description:
            "Suggest a documented HTTPS operation for a protected credential. This creates a temporary draft in this workspace. The owner must review and save it under Protected settings before use.",
          inputSchema: z.object({ name: variableName, request: allowedRequest }).strict(),
        },
        async ({ name, request: draft }) => {
          const local = (await this.store.readWorkspace(binding.scope)).find(
            (v) => v.name === name,
          );
          const credential =
            local ?? (await this.store.read(binding.scope)).find((v) => v.name === name);
          if (!credential?.proxyUrl)
            return {
              isError: true,
              content: [{ type: "text", text: "Choose an existing protected credential." }],
            };
          const key = JSON.stringify([binding.scope.cwd, local ? "workspace" : "project", name]);
          const drafts = (this.drafts.get(key) ?? []).filter((d) => d.id !== draft.id);
          if (drafts.length >= 32 || (!this.drafts.has(key) && this.drafts.size >= 1024))
            return { isError: true, content: [{ type: "text", text: "Proposal limit reached." }] };
          this.drafts.set(key, [...drafts, draft]);
          return {
            content: [
              {
                type: "text",
                text: "Draft ready for review in this workspace’s Protected settings.",
              },
            ],
          };
        },
      );
      response.on("close", () => {
        this.active -= 1;
        this.transports.delete(transport);
        void mcp.close();
      });
      void mcp
        .connect(transport)
        .then(() => transport.handleRequest(request, response))
        .catch(() => {
          if (!response.headersSent) response.writeHead(500).end();
          else response.end();
        });
    });
    server.requestTimeout = 130000;
    server.headersTimeout = 10000;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => {
        server.removeListener("error", reject);
        resolve();
      });
    });
    this.server = server;
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Environment broker has no TCP address");
    this.state.port = address.port;
    try {
      await this.persist();
    } catch {
      await this.close();
      throw new Error("Cannot persist environment broker connection");
    }
  }

  scopes(): ProjectScope[] {
    return this.state.bindings.map(({ scope }) => ({ ...scope }));
  }

  async endpoint(scope: ProjectScope): Promise<string> {
    const change = this.changes.then(async () => {
      const existing = this.state.bindings.find(
        (entry) => entry.scope.id === scope.id && entry.scope.cwd === scope.cwd,
      );
      if (existing) return existing.token;
      if (this.state.bindings.length >= 4096)
        throw new Error("Environment broker workspace limit reached");
      const token = randomBytes(32).toString("hex");
      this.state.bindings.push({ token, scope });
      try {
        await this.persist();
      } catch (error) {
        this.state.bindings.pop();
        throw error;
      }
      return token;
    });
    this.changes = change.catch(() => {});
    const token = await change;
    return `http://127.0.0.1:${this.state.port}/mcp/${token}`;
  }

  private persist(): Promise<void> {
    return privateWrite(path.join(this.directory, "broker.json"), this.state);
  }

  async close(): Promise<void> {
    this.lifetime.abort();
    await Promise.all([...this.transports].map((transport) => transport.close()));
    const server = this.server;
    if (server) {
      const closed = new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        }),
      );
      server.closeAllConnections();
      await closed;
      this.server = null;
    }
  }
}
