import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import path from "node:path";
import {
  listVariables,
  saveVariable,
  addVariables,
  removeVariable,
  readVariableValue,
  variableCatalogue,
  variableDestinations,
  copyVariable,
  type VariableTarget,
} from "./shared/environment";
import { parseBulkVariables } from "./shared/bulk-paste";
import { EnvironmentBroker, toolInstructions } from "./server/broker";
import { buildVariableCatalogue, readWorkspaceDirectory } from "./server/catalogue";
import { projectScope, workspaceScope } from "./server/store";

async function resolveProject(paseo: PluginHandlerContext["paseo"], workspaceId: string) {
  const workspace = await paseo.workspaces.ref(workspaceId).refresh();
  if (!workspace) throw new Error("Workspace is unavailable");
  return projectScope(workspace.workspaceDirectory);
}

async function resolveSource(paseo: PluginHandlerContext["paseo"], target: VariableTarget) {
  return target.kind === "project"
    ? { id: target.scopeId }
    : workspaceScope(await resolveProject(paseo, target.workspaceId));
}

export default function contribute(server: PluginServerContext) {
  const home = process.env.PASEO_HOME ?? path.join(homedir(), ".paseo");
  const broker = new EnvironmentBroker(path.join(home, "plugin-data", "project-environment"));
  const ready = broker.start();
  void ready.catch(() =>
    console.error(
      "Project environment broker failed to start; open its panel to inspect availability.",
    ),
  );
  function start() {
    return ready;
  }
  server.before("agent.create", async ({ request }) => {
    await start();
    const scope = await projectScope(request.config.cwd);
    const url = await broker.endpoint(scope);
    const systemPrompt = [request.config.systemPrompt, toolInstructions]
      .filter(Boolean)
      .join("\n\n");
    return {
      ...request,
      config: {
        ...request.config,
        systemPrompt,
        mcpServers: { ...request.config.mcpServers, project_environment: { type: "http", url } },
      },
    };
  });
  // Resume existing MCP connections at the same port after plugin/daemon reload.
  server.before("agent.session_open", async () => {
    await start();
  });
  server.handle(variableCatalogue, async (_input, { paseo }) => {
    await start();
    const [projects, workspaces] = await Promise.all([
      paseo.projects.list(),
      readWorkspaceDirectory(paseo),
    ]);
    return buildVariableCatalogue({
      store: broker.store,
      projects: projects.projects,
      workspaces,
      bindings: broker.scopes(),
    });
  });
  server.handle(readVariableValue, async ({ target, name }, { paseo }) => {
    await start();
    return { value: await broker.store.readValue(await resolveSource(paseo, target), name) };
  });
  server.handle(variableDestinations, async (_input, { paseo }) => {
    const [projects, workspaces] = await Promise.all([
      paseo.projects.list(),
      readWorkspaceDirectory(paseo),
    ]);
    return {
      destinations: [
        ...projects.projects.map((project) => ({
          target: { kind: "project" as const, projectId: project.projectId },
          label: project.projectDisplayName,
          directory: project.projectRootPath,
        })),
        ...workspaces.map((workspace) => ({
          target: { kind: "workspace" as const, workspaceId: workspace.id },
          label: workspace.name,
          projectName: workspace.projectDisplayName,
          directory: workspace.workspaceDirectory,
        })),
      ].toSorted(
        (a, b) => a.label.localeCompare(b.label) || a.directory.localeCompare(b.directory),
      ),
    };
  });
  server.handle(copyVariable, async ({ source, destination, name, overwrite }, { paseo }) => {
    await start();
    const from = await resolveSource(paseo, source);
    if (destination.kind === "workspace") {
      const workspace = await workspaceScope(await resolveProject(paseo, destination.workspaceId));
      return { status: await broker.store.copy(from, workspace, name, overwrite) };
    }
    const { projects } = await paseo.projects.list();
    const project = projects.find(({ projectId }) => projectId === destination.projectId);
    if (!project) throw new Error("Destination project is unavailable");
    return {
      status: await broker.store.copy(
        from,
        await projectScope(project.projectRootPath),
        name,
        overwrite,
      ),
    };
  });
  server.handle(listVariables, async ({ workspaceId }, { paseo }) => {
    await start();
    const project = await resolveProject(paseo, workspaceId);
    const [variables, workspaceVariables] = await Promise.all([
      broker.store.read(project),
      broker.store.readWorkspace(project),
    ]);
    return {
      scopeId: project.id,
      variables: variables.map(({ name, description }) => ({ name, description })),
      workspaceVariables: workspaceVariables.map(({ name, description }) => ({
        name,
        description,
      })),
    };
  });
  server.handle(saveVariable, async ({ workspaceId, scope, variable }, { paseo }) => {
    await start();
    const project = await resolveProject(paseo, workspaceId);
    await broker.store.save(
      scope === "workspace" ? await workspaceScope(project) : project,
      variable,
    );
    return {};
  });
  server.handle(addVariables, async ({ workspaceId, scope, text, overwriteNames }, { paseo }) => {
    const parsed = parseBulkVariables(text);
    if ("message" in parsed) return { status: "rejected", message: parsed.message } as const;
    await start();
    const project = await resolveProject(paseo, workspaceId);
    return broker.store.saveMany(
      scope === "workspace" ? await workspaceScope(project) : project,
      parsed.variables,
      overwriteNames,
    );
  });
  server.handle(removeVariable, async ({ workspaceId, scope, name }, { paseo }) => {
    await start();
    const project = await resolveProject(paseo, workspaceId);
    await broker.store.remove(
      scope === "workspace" ? await workspaceScope(project) : project,
      name,
    );
    return {};
  });
  return async () => {
    await ready.catch(() => {});
    await broker.close();
  };
}
