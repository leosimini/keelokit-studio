const knownSurfaces = new Set(["web", "native", "desktop", "cli", "api", "provided-material"]);

export class CapabilityError extends Error {
  constructor(surface, affectedScope, availableAdapters) {
    super(`No verified ${surface} adapter is available for ${affectedScope}. Configure and verify an adapter before planning that scope.`);
    this.name = "CapabilityError";
    this.code = "surface_unsupported";
    this.surface = surface;
    this.affectedScope = affectedScope;
    this.availableAdapters = [...availableAdapters];
  }
}

export function assessSurface(surface, {affectedScope = surface, availableAdapters = []} = {}) {
  if (!knownSurfaces.has(surface)) throw new CapabilityError(surface, affectedScope, availableAdapters);
  const adapters = new Set(availableAdapters);
  if (surface === "provided-material") {
    return {surface, adapter: "provided-material", verification: "provenance-limited", requiresGraphicalUi: false};
  }
  if (["cli", "api"].includes(surface) && adapters.has(surface)) {
    return {surface, adapter: surface, verification: "reproducible-request", requiresGraphicalUi: false};
  }
  if (adapters.has(surface)) {
    return {surface, adapter: surface, verification: "adapter-required", requiresGraphicalUi: ["web", "native", "desktop"].includes(surface)};
  }
  throw new CapabilityError(surface, affectedScope, adapters);
}

export function capabilityReport(requests, availableAdapters = []) {
  return requests.map(({surface, scope}) => {
    try {
      return {scope, status: "available", ...assessSurface(surface, {affectedScope: scope, availableAdapters})};
    } catch (error) {
      if (!(error instanceof CapabilityError)) throw error;
      return {scope, surface, status: "blocked", code: error.code, message: error.message};
    }
  });
}

