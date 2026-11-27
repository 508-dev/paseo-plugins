# IronProxy credential isolation prototype

This Linux/amd64 smoke test exercises one synthetic API credential with the real IronProxy v0.61.0 binary. It runs independently of the installed Paseo plugin and its variable store.

Download the linux_amd64 archive from the [pinned release](https://github.com/paradigmxyz/iron-proxy/releases/tag/v0.61.0). Its SHA-256 is `30820ba357b19a41ca6eda77caf7c7105cbd0444343d804711c57b8ae7a3c6a9`. Extract the executable into per-run scratch. The launcher checks the executable's SHA-256 before running it. It requires Docker, OpenSSL and GNU coreutils. Docker can fetch the digest-pinned Node fixture image on first use.

```sh
paseo-resources job -- ./try.sh /absolute/path/to/iron-proxy
```

A trusted Node process generates a random fixture credential and starts IronProxy. Its local HTTPS upstream returns a fixed identity only after verifying the bearer header. The workload runs in a second container with its own PID namespace, a read-only filesystem, dropped capabilities and networking disabled. It gets a public CA certificate and a Unix socket connected exclusively to the IronProxy TLS listener. Both containers are networkless so the loopback upstream exception in the fixture policy stays local to the test. The launcher removes the containers and temporary keys on exit.

The workload checks the authenticated response, route denials, absence of the fixture secret in its environment, and refusal of a direct connection. A fresh workload checks loss of service after proxy shutdown.

## Applying the boundary to Paseo

Protected mode would have to launch the provider process and its descendants inside the isolation boundary, apply the same policy to separate terminals and host commands, and exclude host-side MCP tools that grant shell, filesystem, management or raw-secret access. The trusted side must own policy, the credential store, the proxy process and the per-workspace socket. A socket grants the holder every operation authorized by its policy. Only approve upstream operations whose responses cannot disclose credentials.

Paseo 0.17.6 has launch wraps for supported providers via agent.open.before, terminal.create.before and command.run.before. A production integration must verify each enabled provider and refuse protected sessions when a required launch path cannot be confined. Networkless workloads also need a mediated route for their model provider and other required services. This experiment exercises a command in the proposed boundary; existing Paseo agent sessions use their regular launch path.

## Preview the installation guidance

[Mobile setup preview](./install-mobile.png)

Run `./try.sh --preview /path/to/iron-proxy > preview.html` and open the HTML locally. The preview checks the executable on the machine running the command. Omit the path to search PATH. Missing and unverified binaries block the fixture run and point to the pinned release. The verified state certifies only the binary checksum.

The workload receives `credential.json` read-only. It discovers the sample name, description, mode and permitted operation through this manifest, then uses the advertised route. Keep descriptions suitable for agents to read. A live integration should return the effective metadata in the existing list tool and enforce the mode in the broker.

## Proposed migration and workspace lifetime

A migration would change how agents may use a saved credential. Preserve its owning scope. Select project defaults together or select overrides in one workspace. Preview the permitted API operation for each selected row and identify inherited defaults and shadowing overrides. A project-wide change must show which workspaces inherit it. Let the user make a workspace override explicitly if the change should be local.

For forward migration, validate all routes and protected-runtime prerequisites before committing. At cutover, update the protected policy and revoke raw access as one operation, including cached policies and existing sessions. Scope each batch transaction to one owner and reject stale previews. The reverse action should explicitly confirm that commands may read the raw values again. Previously disclosed credentials may need rotation.

Start with one binary installation per host. Launch one proxy on demand per active protected workspace, reuse it across that workspace's agents, and stop it after inactivity. Resolve project defaults plus workspace overrides into that proxy's policy. Refresh or invalidate affected sessions after edits. A future shared process could use [upstream tenancy mode](https://github.com/paradigmxyz/iron-proxy/blob/v0.61.0/README.md#tenancy-mode), which requires tenant tokens and a trusted configuration endpoint.

## Proposed upgrades

Ship the approved IronProxy release and per-platform SHA-256 digests with the plugin. Offer an explicit host-level **Update IronProxy** action when the installed version differs. Download to a private staging directory, verify the archive and binary, then run a disposable authenticated request and denial check. Promote the verified version atomically and retain the previous compatible binary for rollback. Coordinate active sessions so they either stay on a supported version until drained or stop before an incompatible or security-critical cutover. An upstream release check can report newer versions, but activation should use a release the installed plugin explicitly supports. Production packaging and the updater are outside this fixture.
