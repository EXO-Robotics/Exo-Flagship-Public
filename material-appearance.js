/** Source-qualified display finishes. No geometry, hierarchy, or transform edits. */
export function applyFarmbotAppearance(root, appearance, assembly) {
  if (appearance?.schemaVersion !== 1) throw new Error('Unsupported appearance evidence schema.');
  const metadata = new Map((assembly?.instances ?? []).map((row) => [row.nodeName, row]));
  const byName = new Map(), byPart = new Map();
  for (const rule of appearance.rules ?? []) {
    if (!appearance.profiles[rule.profile]) throw new Error(`Unknown finish profile: ${rule.profile}`);
    for (const name of rule.exactCadNames ?? []) {
      if (byName.has(name)) throw new Error(`Ambiguous appearance name: ${name}`);
      byName.set(name, rule);
    }
    for (const id of rule.partIds ?? []) {
      if (byPart.has(id)) throw new Error(`Ambiguous appearance identity: ${id}`);
      byPart.set(id, rule);
    }
  }
  const clones = new Map(), affectedBodies = new Set(), unchangedBodies = new Set();
  const counts = new Map();
  let changedPrimitives = 0, unchangedPrimitives = 0;
  root.traverse((node) => {
    if (!node.isMesh) return;
    let ancestor = node, body;
    while (ancestor && !body) { body = metadata.get(ancestor.name); ancestor = ancestor.parent; }
    const rule = body && (byName.get(body.cadName) ?? byPart.get(body.partId));
    const profile = rule && appearance.profiles[rule.profile];
    const originalMaterials = Array.isArray(node.material) ? node.material : [node.material];
    let changed = false;
    const materials = originalMaterials.map((original) => {
      if (!profile || !original?.clone || !original.color ||
          (rule.eligibleSourceMaterialNames && !rule.eligibleSourceMaterialNames.includes(original.name))) return original;
      const key = `${original.uuid}:${rule.profile}`;
      let replacement = clones.get(key);
      if (!replacement) {
        replacement = original.clone();
        replacement.name = `${original.name} · ${rule.profile}`;
        // Profiles are visual RGB targets, converted to Three's linear working space.
        // They are not measured paint codes or manufacturing tolerances.
        if (profile.displayColorSRGB) replacement.color.setRGB(...profile.displayColorSRGB, 'srgb');
        else if (profile.reinterpretSourceRGBAsSRGB) replacement.color.convertSRGBToLinear();
        if (profile.metalness != null) replacement.metalness = profile.metalness;
        if (profile.roughness != null) replacement.roughness = profile.roughness;
        replacement.userData = {...original.userData, sourceQualifiedDisplayFinish: rule.profile,
          originalCadMaterialName: original.name, manufacturingColorCode: null};
        replacement.needsUpdate = true;
        clones.set(key, replacement);
      }
      changed = true;
      return replacement;
    });
    if (changed) {
      node.material = Array.isArray(node.material) ? materials : materials[0];
      node.userData.appearanceProfile = rule.profile;
      affectedBodies.add(body.nodeName); changedPrimitives++;
      counts.set(rule.profile, (counts.get(rule.profile) ?? 0) + 1);
    } else { unchangedPrimitives++; if (body) unchangedBodies.add(body.nodeName); }
  });
  return {matchedBodyInstances: affectedBodies.size, changedPrimitives, unchangedPrimitives,
    retainedOriginalMaterials: unchangedBodies.size, clonedMaterials: clones.size,
    profiles: Object.fromEntries(counts), displayOnly: true, exactPaintCodesClaimed: false};
}
