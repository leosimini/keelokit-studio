import {constants} from "node:fs";
import {lstat, open, realpath} from "node:fs/promises";
import {dirname, isAbsolute, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";

const pluginRootPromise = realpath(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));

function isInside(candidate, parent) {
  const path = relative(parent, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export async function resolveConsumerPath(projectRoot, requestedPath) {
  if (typeof requestedPath !== "string" || requestedPath.length === 0 || isAbsolute(requestedPath)) throw new TypeError("Output path must be a non-empty project-relative path");
  const canonicalRoot = await realpath(resolve(projectRoot));
  const pluginRoot = await pluginRootPromise;
  if (isInside(canonicalRoot, pluginRoot)) throw new TypeError("Consumer project must be outside the plugin installation");
  const segments = requestedPath.split(/[\\/]+/);
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) throw new TypeError("Output path cannot contain empty, current, or parent segments");

  let cursor = canonicalRoot;
  let firstMissing = -1;
  for (let index = 0; index < segments.length; index += 1) {
    try {
      cursor = await realpath(resolve(cursor, segments[index]));
      if (!isInside(cursor, canonicalRoot)) throw new TypeError("Output path resolves outside the consumer project");
      if (isInside(cursor, pluginRoot)) throw new TypeError("Output path resolves inside the plugin installation");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const unresolved = resolve(cursor, segments[index]);
      try {
        const entry = await lstat(unresolved);
        if (entry.isSymbolicLink()) throw new TypeError("Output path contains an unresolved symbolic link");
      } catch (lstatError) {
        if (lstatError.code !== "ENOENT") throw lstatError;
      }
      firstMissing = index;
      break;
    }
  }
  const destination = firstMissing === -1 ? cursor : resolve(cursor, ...segments.slice(firstMissing));
  if (!isInside(destination, canonicalRoot)) throw new TypeError("Output path resolves outside the consumer project");
  if (isInside(destination, pluginRoot)) throw new TypeError("Output path resolves inside the plugin installation");
  return destination;
}


// Reads a project file without following a final symlink or blocking on a FIFO or device.
export async function readRegularFile(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw new TypeError("Source must be a regular file");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}
