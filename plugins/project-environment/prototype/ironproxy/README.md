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
