import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname} from "node:path";
import {resolveConsumerPath} from "./paths.mjs";

// Stores capture bytes inside the project under a content-addressed name; identical bytes are reused, a collision is an error.
export async function storeCaptureBytes({projectRoot, outputDirectory, captureId, suffix = "", content}) {
  const sha256 = createHash("sha256").update(content).digest("hex");
  const path = `${outputDirectory}/${captureId}${suffix}-${sha256}.png`;
  const absolutePath = await resolveConsumerPath(projectRoot, path);
  await mkdir(dirname(absolutePath), {recursive: true});
  try {
    await writeFile(absolutePath, content, {flag: "wx"});
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existingHash = createHash("sha256").update(await readFile(absolutePath)).digest("hex");
    if (existingHash !== sha256) throw new Error("Content-addressed capture collision");
  }
  return {path, hash: `sha256:${sha256}`};
}
