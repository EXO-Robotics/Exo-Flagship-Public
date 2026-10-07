// Optional page-scoped agent tools use the same catalog and request state as the UI.
const lifecycle = new AbortController();
const schema = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const inputObject = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) throw new Error('Invalid input object');
  return value;
};
const registrations = [];
const makeTool = (name, description, inputSchema, readOnlyHint, execute) => ({ name, description, inputSchema, annotations: { readOnlyHint, untrustedContentHint: false }, execute });
async function register() {
  if (!document.modelContext?.registerTool) return;
  const api = window.farmbotShowcase;
  const tools = [
    makeTool('search_source_cad_components', 'Read exact source CAD body names and assembly groups, including components awaiting BOM reconciliation.', schema({ query: { type: 'string', maxLength: 200 } }, ['query']), true, input => {
      const { query } = inputObject(input, ['query']);
      if (typeof query !== 'string' || query.length > 200) throw new Error('Query must be a string of at most 200 characters');
      if (!api.searchCadBodies) throw new Error('Source CAD assembly not loaded');
      const components = api.searchCadBodies(query);
      return { count: components.length, components };
    }),
    makeTool('inspect_source_cad_component', 'Select an exact source CAD body in the visible viewer. Does not assign an unverified purchasing identity or submit an order.', schema({ nodeName: { type: 'string', minLength: 1 } }, ['nodeName']), false, input => {
      const { nodeName } = inputObject(input, ['nodeName']);
      if (typeof nodeName !== 'string' || !nodeName) throw new Error('A source node identity is required');
      if (!api.inspectCadBody) throw new Error('Source CAD assembly not loaded');
      return api.inspectCadBody(nodeName);
    }),
    makeTool('search_documented_parts', 'Read source-backed Genesis v1.8 parts matching a text query; does not change the page.', schema({ query: { type: 'string', maxLength: 200 } }, ['query']), true, input => {
      const { query } = inputObject(input, ['query']);
      if (typeof query !== 'string' || query.length > 200) throw new Error('Query must be a string of at most 200 characters');
      return api.searchParts(query);
    }),
    makeTool('inspect_documented_part', 'Select a documented part and display its specifications and CAD selection in the visible inspector.', schema({ id: { type: 'string', minLength: 1 } }, ['id']), false, input => {
      const { id } = inputObject(input, ['id']);
      if (typeof id !== 'string' || !id) throw new Error('A part identity is required');
      return api.inspectPartById(id);
    }),
    makeTool('stage_parts_request', 'Set quantities for documented Genesis parts and open the local request for review. Retains other request items; does not submit an order or purchase.', schema({ items: { type: 'array', minItems: 1, maxItems: 195, items: schema({ id: { type: 'string', minLength: 1 }, quantity: { type: 'integer', minimum: 1, maximum: 9999 } }, ['id', 'quantity']) } }, ['items']), false, input => {
      const { items } = inputObject(input, ['items']);
      if (!Array.isArray(items) || !items.length || items.length > 195) throw new Error('Provide 1 to 195 request items');
      const seen = new Set();
      for (const item of items) { inputObject(item, ['id', 'quantity']); if (typeof item.id !== 'string' || !item.id || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999 || seen.has(item.id)) throw new Error('Invalid or duplicate request item'); seen.add(item.id); }
      return api.stagePartsRequest(items);
    }),
  ];
  for (const tool of tools) {
    try { await document.modelContext.registerTool(tool, { signal: lifecycle.signal }); registrations.push(tool.name); }
    catch { /* A browser without tool support still has the complete visible interface. */ }
  }
}
window.addEventListener('farmbot:ready', register, { once: true });
window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
