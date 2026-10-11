import {readdir, readFile} from "node:fs/promises";
import {extname, join, relative, resolve} from "node:path";
import {validateContracts} from "../contracts/validate.mjs";

async function filesUnder(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)]));
  return nested.flat();
}

export async function verifyPortability({repositoryRoot, fixtures, forbiddenTokens = []}) {
  if (!Array.isArray(fixtures) || fixtures.length < 2) throw new TypeError("At least two product fixtures are required");
  const products = [];
  for (const directory of fixtures) {
    const validation = await validateContracts(directory);
    const context = JSON.parse(await readFile(join(directory, "project-context.json"), "utf8"));
    const audiences = JSON.parse(await readFile(join(directory, "audiences.json"), "utf8"));
    const plan = JSON.parse(await readFile(join(directory, "content-plan.json"), "utf8"));
    products.push({project_id: context.project_id, audience_count: audiences.audiences.length, suite_count: plan.suites.length, piece_count: plan.suites.flatMap(({pieces}) => pieces).length, valid: validation.valid, errors: validation.errors});
  }
  const sourceRoots = ["src", "schemas", "commands", "skills"].map((path) => resolve(repositoryRoot, path));
  const forbidden = [...products.map(({project_id}) => project_id.toLowerCase()), ...forbiddenTokens.map((token) => token.toLowerCase())];
  const leaks = [];
  for (const root of sourceRoots) for (const path of await filesUnder(root)) {
    if (![".mjs", ".json", ".md"].includes(extname(path))) continue;
    const content = (await readFile(path, "utf8")).toLowerCase();
    for (const token of forbidden) if (content.includes(token)) leaks.push({path: relative(repositoryRoot, path), token});
  }
  return {status: products.every(({valid}) => valid) && new Set(products.map(({project_id}) => project_id)).size === products.length && leaks.length === 0 ? "passed" : "failed", products, core_leaks: leaks, limits: ["Synthetic fixture validation does not establish coverage for every real product surface"]};
}
