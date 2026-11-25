import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const variableName = z
  .string()
  .regex(/^[A-Z_][A-Z0-9_]*$/)
  .max(128);
export const variableMetadata = z.object({ name: variableName, description: z.string().max(500) });
export const variableInput = variableMetadata.extend({
  value: z
    .string()
    .min(1)
    .max(16384)
    .refine((value) => !value.includes("\0"), "Values cannot contain a null character"),
});
const workspaceInput = z.object({ workspaceId: z.string().min(1) });
const editScope = workspaceInput.extend({
  scope: z.enum(["project", "workspace"]).default("project"),
});
export const scopeId = z.string().regex(/^[a-f0-9]{64}$/);
export const listVariables = defineRpc({
  name: "environment.list",
  input: workspaceInput,
  output: z.object({
    scopeId,
    variables: z.array(variableMetadata),
    workspaceVariables: z.array(variableMetadata),
  }),
});
export const saveVariable = defineRpc({
  name: "environment.save",
  input: editScope.extend({ variable: variableInput }),
  output: z.object({}),
});
export const bulkPasteLimit = 64 * 1024;
export const addVariables = defineRpc({
  name: "environment.add-variables",
  input: workspaceInput.extend({
    scope: z.enum(["project", "workspace"]),
    text: z.string().max(bulkPasteLimit),
    overwriteNames: z.array(variableName).max(256).default([]),
  }),
  output: z.discriminatedUnion("status", [
    z.object({
      status: z.literal("saved"),
      added: z.number().int().nonnegative(),
      updated: z.number().int().nonnegative(),
    }),
    z.object({ status: z.literal("rejected"), message: z.string() }),
  ]),
});
export const removeVariable = defineRpc({
  name: "environment.remove",
  input: editScope.extend({ name: variableName }),
  output: z.object({}),
});

export const variableTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workspace"), workspaceId: z.string().min(1) }),
  z.object({ kind: z.literal("project"), scopeId }),
]);
export type VariableTarget = z.infer<typeof variableTarget>;
export const readVariableValue = defineRpc({
  name: "environment.value",
  input: z.object({ target: variableTarget, name: variableName }),
  output: z.object({ value: z.string() }).strict(),
});

const copyDestination = z.discriminatedUnion("kind", [
  workspaceInput.extend({ kind: z.literal("workspace") }),
  z.object({ kind: z.literal("project"), projectId: z.string().min(1) }),
]);
const destinationOption = z.object({
  target: copyDestination,
  label: z.string(),
  directory: z.string(),
});
export const variableDestinations = defineRpc({
  name: "environment.destinations",
  input: z.object({}),
  output: z.object({ destinations: z.array(destinationOption) }),
});
export const copyVariable = defineRpc({
  name: "environment.copy",
  input: z.object({ source: variableTarget, destination: copyDestination, name: variableName }),
  output: z
    .object({ status: z.enum(["copied", "exists", "same-scope", "missing", "full"]) })
    .strict(),
});
export type CopyStatus = z.infer<typeof copyVariable.output>["status"];

export const catalogueProject = z
  .object({
    scopeId,
    name: z.string(),
    directory: z.string().nullable(),
    workspaces: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          directory: z.string(),
          variables: z.array(variableMetadata.strict()),
        })
        .strict(),
    ),
    variables: z.array(variableMetadata.strict()),
  })
  .strict();
export type CatalogueProject = z.infer<typeof catalogueProject>;
export const variableCatalogue = defineRpc({
  name: "environment.catalogue",
  input: z.object({}).strict(),
  output: z
    .object({
      projects: z.array(catalogueProject),
      unavailableDirectories: z.number().int().nonnegative(),
    })
    .strict(),
});

export function filterVariableCatalogue(
  projects: CatalogueProject[],
  query: string,
): CatalogueProject[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  function matches({ name, description }: z.infer<typeof variableMetadata>) {
    const text = `${name}\n${description}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  }
  return projects.flatMap((project) => {
    const variables = project.variables.filter(matches);
    const workspaces = project.workspaces.flatMap((workspace) => {
      const localVariables = workspace.variables.filter(matches);
      return variables.length || localVariables.length
        ? [{ ...workspace, variables: localVariables }]
        : [];
    });
    return variables.length || workspaces.length ? [{ ...project, variables, workspaces }] : [];
  });
}
