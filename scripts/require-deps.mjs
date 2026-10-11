import {existsSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!existsSync(resolve(root, "node_modules/ajv/package.json"))) {
  console.error(`Keelokit Studio dependencies are not installed. Install them once, for this machine:\n\n  npm ci --omit=dev --ignore-scripts --prefix "${root}"\n\nThen run the command again. Nothing else is written there at runtime; project state goes to <project>/.keelokit/studio/.`);
  process.exit(3);
}
