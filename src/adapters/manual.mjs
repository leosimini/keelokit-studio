import {readFile} from "node:fs/promises";
import {inspectContextSources} from "./context.mjs";
import {readRegularFile, resolveConsumerPath} from "../core/paths.mjs";

export async function inspectManual({projectRoot, projectId, path, observedAt, build = null, status = "inferred"}) {
  return inspectContextSources({
    projectRoot,
    projectId,
    observedAt,
    sources: [{kind: "manual", path, build, status}]
  });
}

export async function readManualExcerpt({projectRoot, path, maxCharacters = 12_000}) {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 1) throw new TypeError("maxCharacters must be a positive safe integer");
  const resolvedPath = await resolveConsumerPath(projectRoot, path);
  const content = (await readRegularFile(resolvedPath)).toString("utf8");
  return {
    location: path.split(/[\\/]+/).join("/"),
    excerpt: content.slice(0, maxCharacters),
    truncated: content.length > maxCharacters
  };
}

