// Copies the public Cognito identifiers from cdk-outputs.json into frontend/.env.local.
// The backend reads cdk-outputs.json directly. No secrets are involved.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outputs = JSON.parse(
  readFileSync(resolve(here, "../cdk-outputs.json"), "utf8"),
);

const flat = Object.assign({}, ...Object.values(outputs));
const required = ["UserPoolId", "UserPoolClientId"];
for (const name of required) {
  if (!flat[name]) throw new Error(`Missing stack output: ${name}`);
}

const region = flat.UserPoolId.split("_")[0];
const lines = [
  `VITE_AWS_REGION=${region}`,
  `VITE_USER_POOL_ID=${flat.UserPoolId}`,
  `VITE_USER_POOL_CLIENT_ID=${flat.UserPoolClientId}`,
];
if (flat.ApiUrl) lines.push(`VITE_API_BASE_URL=${flat.ApiUrl.replace(/\/$/, "")}`);

const target = resolve(here, "../../frontend/.env.local");
writeFileSync(target, `${lines.join("\n")}\n`);
console.log(`Wrote ${target}`);
