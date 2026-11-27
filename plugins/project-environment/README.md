# Project environment

Save environment variables in Paseo and let your agents use them in commands and API requests. Add an API key once, describe what it is for, and ask an agent to use it without editing `.env` files or pasting the key into chat.

The plugin adds a searchable **Environment variables** view, a **Project environment** workspace panel, and two agent tools. Agents can discover the names and descriptions of available variables, then run commands with the variables they need. Each command reads the latest saved values, so you can change a key without reopening the agent.

## Install

Requires Paseo 0.13.2 or later and a macOS or Linux daemon.

Enable plugins under **Settings → Plugins** on the host where your agents run, then install:

```sh
paseo plugin install git:508-dev/paseo-plugins:plugins/project-environment
```

You can also paste that Git source into **Settings → Plugins → Plugin source** in Paseo. The plugin and its variables live on the selected host.

## Add your first variable

1. Open a workspace in Paseo.
2. On mobile, tap **⋯ → Environment variables** in the workspace header. On desktop, select the key icon in the workspace header, or open the Command Center with **⌘K** on macOS or **Ctrl+K** on Windows/Linux and choose **Project environment**.
3. Choose **Project defaults** to share the variable across the project's workspaces, or **Workspace variables** to keep it in the current workspace. Under **Add variable**, enter its name, description, and value. For example:
   - **Name:** `STRIPE_API_KEY`
   - **Description:** `Stripe test-mode key for reading customers`
   - **Value:** Paste your key into the value field. Choose **Show value** to check your input and **Hide value** to mask it again.
4. Select **Add variable**. The panel confirms the addition and lists the name and description. Use the eye or clipboard next to the name to reveal or copy the saved value.

Git worktrees of the same repository inherit the same project defaults. To override a default, add a variable with the same name under **Workspace variables**. A workspace can also define its own names. Removing a workspace override restores the project default on the next command. Existing saved variables are project defaults.

See the [project defaults](docs/qa/project-defaults-desktop.png) and [workspace override](docs/qa/workspace-override-compact.png) screenshots.

## Paste variables in bulk

Choose **Project defaults** or **Workspace variables**, then select **Paste variables** under **Add variable**. Paste one assignment per line. Review the new and existing names before saving.

```dotenv
ERPNEXT_API_SECRET=example
ERPNEXT_BASE_URL=https://example.com
```

Blank lines and lines beginning with `#` are skipped. Everything after the first `=` is saved literally, including quotes, spaces, and additional equals signs. Pasted text is visible in the editor. Matching names in the selected scope are overwritten and keep their descriptions. Check **Protect existing values** to block the batch until you remove any matching names from the paste. Invalid lines and duplicate names within the paste block the whole batch.

## Find variables across projects

Open **Environment variables** from the sidebar, or choose **Search environment variables** in the Command Center. Search by name or description to find matching variables across projects and workspaces on the selected host. Values are excluded from the search response and are never used for matching.

Results show project defaults and variables saved in individual active workspaces. Choose **Open variables** beside a workspace to manage both scopes. Project defaults remain listed when there is no active workspace. Older entries whose project cannot be identified appear under **Unidentified project**. Use **Refresh** to reload the list after changes elsewhere.

## Reveal or copy a value

Tap the eye next to the variable name to reveal the value or the clipboard to copy it. These actions fetch only the selected value when clicked. Values do not enter the searchable catalogue or query cache. Revealed values hide after 30 seconds, when the app becomes inactive, or when the view closes. Copy shows a confirmation after the clipboard write succeeds.

Choose **Copy to…**, select **Projects** or **Workspaces**, and search for a destination on the same host. Select a destination and confirm **Copy variable**. Paseo copies the name, description, and value on the host. If the destination already has that name, choose **Overwrite variable** to replace its value and description.

## Ask an agent to use it

For the first try, create a new agent in that workspace after installing the plugin. New agents receive the tools and usage instructions automatically. Agents created before installation need one-time MCP configuration before they can discover these tools.

Try a check that does not make an API request:

> List the project environment variables. Use the environment command tool to check that STRIPE_API_KEY is set, without printing its value.

Then ask for an API operation:

> Use STRIPE_API_KEY from the project environment to fetch five Stripe customers. Run the request through the environment command tool, read the key from the environment, and show me the customer summaries. Do not print the key or write it into a file.

The agent submits code that references the variable by name, such as `os.environ["STRIPE_API_KEY"]` in Python or `$STRIPE_API_KEY` in a shell command. The plugin injects the actual value when that command runs. The API receives the credential; the agent receives the command's output with exact saved values redacted.

The two tools are:

| Tool                       | What it does                                                                 |
| -------------------------- | ---------------------------------------------------------------------------- |
| `project_environment_list` | Lists available variable names and descriptions without returning values.    |
| `project_environment_run`  | Runs a shell command in the workspace with the requested variables injected. |

Use the environment command tool for commands that need saved variables. The agent's ordinary shell tool, existing terminals, and running development servers do not automatically receive them.

## Change or remove a variable

Open **Project environment**, find the saved variable, and choose **Replace**. The new-value and description fields open inside that variable's card. Choose **Show value** beside the new-value field to check what you typed. Choose **Save replacement** to apply the change or **Cancel** to discard it. A confirmation appears in the same card after saving. The separate **Add variable** form stays untouched.

To delete a variable, choose **Remove**, then **Confirm remove** in its card. **Cancel** keeps it. A confirmation remains above the saved-variable list after deletion.

The next environment command uses the updated set of variables. You do not need to reopen the agent or reconnect its tools. Commands already running keep the values they started with. Ask the agent to list variables again if you have added or removed names.

## Storage and access

Save values through the panel rather than chat. Variables are stored outside the project in owner-only plaintext files on the daemon host. Commands run with that host user's filesystem and network access and can perform whatever API operations a key permits. Redaction reduces accidental disclosure but cannot prevent a command from writing or transmitting a credential.

See [OVERVIEW.md](OVERVIEW.md) for the storage path, execution limits, output handling, and access boundaries.

## Development

```sh
git clone https://github.com/508-dev/paseo-plugins.git
cd paseo-plugins/plugins/project-environment
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
paseo plugin install "$PWD"
```

The behavior tests include an API request with an injected key, replacing that key through the same MCP connection, and continuing to use the connection after a broker restart. Dependencies use a committed lockfile. The local npm configuration enables legacy peer resolution because npm 10 crashes when resolving the SDK's optional peer graph.

See [browser QA captures](docs/qa/README.md) for the scope, search, and inline editing checks.

Registry publication requires interface screenshots and a separate registry submission. This repository currently supports installation from Git.

### Use through IronProxy

In the all-workspaces Variables catalogue, select the shield beside a credential. The workspace Environment panel also offers **Protect**. Pick a preset or select an HTTP method and enter one exact public HTTPS endpoint. GET, POST, PUT, PATCH and DELETE are available for the first request. Agents must explicitly select the default operation by ID when it writes. The endpoint must accept an Authorization bearer token and must keep credentials out of its responses. Agent discovery includes the name, description, approved route and a hint to call `project_environment_request` with the name. Other requests and ordinary variables keep their existing behavior.

In **Protected settings → Add request**, give an operation a name, choose GET, POST, PUT, PATCH or DELETE, and enter its exact HTTPS URL. Save the allowed requests to authorize future calls with that credential. Agents can look up provider documentation and submit suggestions with `project_environment_propose_request`. Review a suggestion in the same workspace, add it and save. Drafts expire on plugin restart. The request tool accepts the operation ID and an optional JSON body string for write methods. Approving a write grants repeated use with agent-chosen JSON bodies.

The plugin rejects raw reveal, clipboard reads and shell injection for a proxy credential. An owner can explicitly restore shell access in **Protected settings**. This controls plugin access. Values are still stored in owner-only files, and processes with unrestricted access to the host account can read them.

The host-wide Variables screen shows whether the IronProxy binary is verified. Download the archive for the Paseo daemon from the [IronProxy v0.61.0 release](https://github.com/paradigmxyz/iron-proxy/releases/tag/v0.61.0).

| Host                | Archive                                 | SHA-256                                                            |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| macOS Apple Silicon | `iron-proxy_0.61.0_darwin_arm64.tar.gz` | `ea31caae6200b2dd10aa496b095e6ffe9255ba461cc0663b1cb799c6c3bddcd5` |
| macOS Intel         | `iron-proxy_0.61.0_darwin_amd64.tar.gz` | `861d1b4a629ae40a8b83c82755cabb098867c2bde671f782598400e016f77f24` |
| Linux AMD64         | `iron-proxy_0.61.0_linux_amd64.tar.gz`  | `30820ba357b19a41ca6eda77caf7c7105cbd0444343d804711c57b8ae7a3c6a9` |

Verify the archive checksum (on macOS, run `shasum -a 256 <archive>`), extract `iron-proxy`, and install it executable at `~/.local/lib/paseo-project-environment/iron-proxy-v0.61.0` for the daemon account. The plugin checks the pinned binary digest before use, starts a temporary loopback proxy for each request and stops it afterward. It does not follow redirects or accept agent-specified hosts, headers or paths.
