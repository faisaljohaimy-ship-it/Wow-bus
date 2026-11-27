const SAFE_ENGINES = new Set(["css", "waapi", "glsl-webgl", "remotion-adapter", "three-adapter"]);

export function validateComponent(component, catalogIds) {
  if (!catalogIds.has(component.id)) throw new Error(`Unknown catalog id: ${component.id}`);
  if (!SAFE_ENGINES.has(component.engine)) throw new Error(`Unknown engine: ${component.engine}`);
  if (component.implementation_status !== "implemented") throw new Error("Invalid implementation state");
  if (!Array.isArray(component.used_by) || !component.used_by.includes("motion-lab")) {
    throw new Error("Missing concrete consumer");
  }
  return component;
}

export function statusFor(catalogEntry, componentsById) {
  const component = componentsById.get(catalogEntry.id);
  if (!component) {
    return {indexed: true, implemented: false, tested: false, runtime: "not-tested", used: false};
  }
  return {
    indexed: true,
    implemented: component.implementation_status === "implemented",
    tested: component.test_status === "automated",
    runtime: component.runtime_status,
    used: component.used_by.length > 0,
  };
}

export function reducedMotionRequested(controlValue, mediaMatches = false) {
  if (controlValue === "reduce") return true;
  if (controlValue === "full") return false;
  return mediaMatches;
}

export function animationOptions(spec) {
  return {duration: spec.duration_ms, easing: spec.easing, fill: "both", iterations: 1};
}

export function mirroredKeyframes(keyframes, shouldMirror) {
  if (!shouldMirror) return keyframes;
  return keyframes.map((frame) => {
    if (typeof frame.transform !== "string") return {...frame};
    return {...frame, transform: frame.transform.replace(/translateX\((-?)([0-9.]+)(px|rem|em|%)\)/g,
      (_match, sign, value, unit) => `translateX(${sign ? "" : "-"}${value}${unit})`)};
  });
}
