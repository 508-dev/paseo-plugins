import { createHash } from "node:crypto";
import { accessSync, constants, readFileSync, statSync } from "node:fs";

const escape = (value) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const release = "v0.61.0";
const asset = "iron-proxy_0.61.0_linux_amd64.tar.gz";
const url = `https://github.com/paradigmxyz/iron-proxy/releases/tag/${release}`;
const checksum = "c223d05522bba90dc30490964e90d0d43029d55f1f1d4a0d23ca29dd39d54c4e";
const binary = process.argv[3];
function inspect() {
  if (process.platform !== "linux" || process.arch !== "x64") {
    return [
      "Unsupported host",
      `This prototype supports Linux AMD64. This host runs ${process.platform} / ${process.arch}.`,
    ];
  }
  if (!binary || !statSync(binary, { throwIfNoEntry: false })?.isFile()) {
    return [
      "IronProxy setup required",
      "Install IronProxy on the computer running Paseo to try this protected request.",
    ];
  }
  try {
    accessSync(binary, constants.R_OK | constants.X_OK);
  } catch {
    return [
      "Check file permissions",
      "The host needs permission to read and execute the selected binary.",
    ];
  }
  if (createHash("sha256").update(readFileSync(binary)).digest("hex") !== checksum) {
    return [
      "IronProxy verification failed",
      `The selected file does not match the approved ${release} binary. Download the pinned asset and extract it again.`,
    ];
  }
  return [
    "Binary verified",
    `The host binary matches IronProxy ${release}. Run the fixture to test the connection.`,
  ];
}

const [title, detail] = inspect();
const verified = title === "Binary verified";
const install = ["IronProxy setup required", "IronProxy verification failed"].includes(title);
if (process.argv[2] === "check") {
  if (!verified) {
    console.error(detail);
    if (install)
      console.error(`Get ${asset} at ${url} and rerun try.sh with the extracted binary path.`);
    process.exitCode = 1;
  }
} else {
  const credential = JSON.parse(readFileSync(new URL("./credential.json", import.meta.url)));
  console.log(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Protected credential · Project environment prototype</title>
<style>
:root{color-scheme:light dark;font:16px/1.5 system-ui}
body{margin:0 auto;max-width:38rem;padding:clamp(1rem,5vw,3rem)}
h1{font-size:1.6rem} h2{font-size:1.1rem} section{border-top:1px solid GrayText;padding:.6rem 0}
a{display:inline-block;padding:.65rem 0} code{overflow-wrap:anywhere}
</style><main><p>Project environment · Protected credential prototype</p><h1>${escape(credential.name)}</h1>
<section><h2>${title}</h2><p>${escape(detail)}</p>
${binary ? `<p>Selected path <code>${escape(binary)}</code></p>` : ""}
${
  install
    ? `<ol><li>On the Paseo host, download <code>${asset}</code> from the <a href="${url}">IronProxy ${release} release</a>.</li>
<li>Extract the binary and run <code>./try.sh /path/to/iron-proxy</code>. The launcher verifies its checksum before use.</li></ol>`
    : ""
}
</section><section><h2>What the agent can see</h2><p>${verified ? "Connection test pending." : "Protected requests are unavailable."} The fixture keeps the secret value outside the agent.</p>
<p>${escape(credential.description)}</p><code>${escape(credential.method)} https://${escape(credential.host + credential.path)}</code>
<p>${escape(credential.usage)}</p></section></main></html>`);
}
