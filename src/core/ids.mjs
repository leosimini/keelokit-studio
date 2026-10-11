import {createHash} from "node:crypto";

function canonical(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Stable ID identity parts must contain only finite JSON numbers");
    return value;
  }
  if (typeof value !== "object") throw new TypeError("Stable ID identity parts must contain only JSON values");
  if (ancestors.has(value)) throw new TypeError("Stable ID identity parts cannot contain cycles");

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) throw new TypeError("Stable ID identity arrays cannot be sparse or have extra properties");
      return value.map((item) => canonical(item, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Stable ID identity objects must be plain JSON objects");
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], ancestors)]));
  } finally {
    ancestors.delete(value);
  }
}

export function stableId(prefix, ...parts) {
  if (!/^[a-z][a-z0-9-]*$/.test(prefix)) throw new TypeError("ID prefix must use lowercase kebab-case");
  if (parts.length === 0 || parts.some((part) => part === undefined)) throw new TypeError("Stable IDs require defined identity parts");
  const digest = createHash("sha256").update(JSON.stringify(canonical(parts))).digest("hex").slice(0, 16);
  return `${prefix}-${digest}`;
}

export function contentHash(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex")}`;
}

