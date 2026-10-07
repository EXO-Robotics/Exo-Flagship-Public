import * as THREE from 'three';
import {directBodyBinding} from '/part-identity.js?v=purchase-1';
import {createPlatformExperience} from '/platform-experience.js?v=purchase-1';
import {cameraDistance} from '/camera-fit.js?v=purchase-1';
import {AssemblyExplosion,explosionControls,SelectionLocationCue} from './assembly-explosion.js?v=context-1';
import {machineData,money,labels,savePart} from './shop/commerce.js?v=purchase-1';
import {renderPartSnippet as renderCommerce,mountMinimalViewer} from './part-snippet.js?v=purchase-1';
mountMinimalViewer('farmbot');
let shopData,experience,lastPresentationFrame=0;
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from './vendor/meshoptimizer/meshopt_decoder.module.js';
import { loadChunkedAsset } from './chunked-assets.js';
import './webmcp.js?v=20261002-selection-v4';
import { applyFarmbotAppearance } from './material-appearance.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const storageKey = 'equipment-explorer:farmbot-genesis-v1.8:parts-request';
let catalog, assembly, procurement, parts = [], selectedPart, selectedMesh, controls, camera, renderer, root;
let selectedOutline, selectedTint, hoverTint, hoveredBody, viewRadius = 1, exploded = false, isolated = false, lastTime = 0, explosion, explosionUI, locationCue, assemblyScope = null, focused = false, renderDirty = true;
let partsById = new Map(), procurementById = new Map(), reconciliationById = new Map(), exactNames = new Map(), meshBindings = new Map(), documentaryBindings = new Map();
const sourceBodies = [], bodyMetadata = new Map(), bodyPartIds = new Map();
let pickCandidates = [], pickIndex = 0, cameraAspect;
const meshes = [], batches = [], homePose = new Map(), order = new Map(), animations = [];
const scene = new THREE.Scene();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const homeTarget = new THREE.Vector3();
let homeCamera = new THREE.Vector3(), currentExplode = 0, toastTimer;
const audit = { catalogLoaded: false, modelLoaded: false, renderedMeshes: 0, mappedMeshes: 0, failures: [] };
window.farmbotShowcase = { audit, getSelection: () => selectedPart?.id ?? null, getOrder: () => [...order.entries()], getMeshNames: () => meshes.map((m) => m.name), getDiagnostics: () => ({
  selectedBody: selectedMesh?.name ?? null,
  hoveredBody: hoveredBody?.name ?? null,
  overlapCandidates: pickCandidates.map((body) => body.name),
  overlapIndex: pickIndex,
  indexedBodies: sourceBodies.length,
  sourceAssemblyGroup: selectedMesh ? bodyGroup(selectedMesh) : null,
  selectedBodyPrimitives: meshes.filter((m) => sourceBody(m) === selectedMesh).length,
  visiblePrimitives: meshes.filter((m) => !isolated || sourceBody(m) === selectedMesh).length,
  assemblyScope,
  locationCue:locationCue?.diagnostics(),
  bodyCount: new Set(meshes.map(sourceBody)).size,
  drawCalls: renderer?.info.render.calls ?? null,
  renderedTriangles: renderer?.info.render.triangles ?? null,
  isolated:experience?.session?.isolated??isolated, exploded:experience?.session?.exploded??exploded, currentExplode,
  sourcePoseRestored: experience?.session?.diagnostics().sourcePoseRestored ?? explosion?.diagnostics().sourcePoseRestored ?? false,
  bodyExplosionConsistent: explosion?.diagnostics().bodiesRigid ?? false,
  explosion: experience?.session?.diagnostics()??explosion?.diagnostics(),

}) };

const clean = (s) => String(s ?? '').replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]*>/g, '').trim();
const norm = (s) => clean(s).toLowerCase().replace(/\s+/g, ' ');
const element = (tag, text, className) => { const e = document.createElement(tag); if (text != null) e.textContent = clean(text); if (className) e.className = className; return e; };
function safeLink(url, label) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  const a = element('a', label); a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a;
}
function announce(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2600); }
function persistOrder() { try { localStorage.setItem(storageKey, JSON.stringify([...order.entries()])); } catch { /* Request remains usable without storage. */ } }
function quantity(part) { return part.quantity ?? null; }
function sourceQuantity(part) { return quantity(part) == null ? 'Not specified' : String(quantity(part)); }
function categoryName(part) { return part.categoryLabel ?? part.category ?? 'Uncategorized'; }

function download(name, content, mime) {
  const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function configureNativeCadDownload(manifestUrl) {
  if (!manifestUrl) return;
  const link = $('native-cad-download'), status = $('native-cad-status');
  link.href = manifestUrl; link.hidden = false;
  let inProgress = false;
  link.onclick = async (event) => {
    event.preventDefault(); if (inProgress) return;
    inProgress = true; link.setAttribute('aria-disabled', 'true');
    try {
      const verified = await loadChunkedAsset(manifestUrl, (progress) => {
        status.textContent = progress.phase === 'verify' ? 'Verifying the original STEP file…' : `Downloading source STEP · ${Math.round(progress.loaded / progress.total * 100)}%`;
      });
      download(verified.manifest.filename, verified.bytes, verified.manifest.mimeType);
      status.textContent = 'Verified original STEP downloaded.'; link.textContent = 'Download source STEP again ↓';
    } catch (error) { status.textContent = `${error.message} Click to retry.`; link.textContent = 'Retry source STEP download ↓'; }
    finally { inProgress = false; link.removeAttribute('aria-disabled'); }
  };
}
Object.assign(window.farmbotShowcase, {
  searchParts(query) {
    if (typeof query !== 'string' || query.length > 200) throw new Error('Query must be a string of at most 200 characters.');
    const text = norm(query);
    const matches = parts.filter((part) => norm([part.name, part.internalName, part.revision, categoryName(part), JSON.stringify(part.specs), part.notes].join(' ')).includes(text));
    return {revision: 'Genesis v1.8', count: matches.length, parts: matches.map((part) => ({id: part.id, name: part.name, category: categoryName(part), standardQuantity: quantity(part), revision: part.revision ?? null, documentUrl: part.documentUrl, cadUrl: part.cadUrl, procurementStatus: procurementById.get(part.id)?.matchStatus ?? 'not-verified'}))};
  },
  inspectPartById(id) {
    if (typeof id !== 'string' || !partsById.has(id)) throw new Error('Unknown documented part identity.');
    const part = partsById.get(id); inspectPart(part);
    return {selectedPartId: id, name: part.name, geometrySelected: !!selectedMesh, standardQuantity: quantity(part), documentUrl: part.documentUrl};
  },
  stagePartsRequest(items) {
    if (!Array.isArray(items) || !items.length || items.length > 195) throw new Error('Provide 1 to 195 documented request items.');
    const staged = new Map(order), seen = new Set();
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some((key) => !['id', 'quantity'].includes(key)) || typeof item.id !== 'string' || !partsById.has(item.id) || seen.has(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999) throw new Error('Invalid, duplicate, or unknown request item.');
      if (quantity(partsById.get(item.id)) === 0) throw new Error('An XL alternative cannot be requested for standard Genesis.');
      seen.add(item.id); staged.set(item.id, item.quantity);
    }
    order.clear(); for (const [id, count] of staged) order.set(id, count);
    persistOrder(); renderOrder(); if (!$('order-panel').open) $('order-panel').showModal();
    $('order-toggle').setAttribute('aria-expanded', 'true');
    return {status: 'staged-for-review', orderSubmitted: false, purchaseSubmitted: false, retainsOtherItems: true, items: [...order].map(([id, count]) => ({id, name: partsById.get(id).name, quantity: count}))};
  },
});
const csvValue = (v) => { let s = clean(v); if (/^[=+@\-\t\r]/.test(s)) s = "'" + s; return `"${s.replaceAll('"', '""')}"`; };
function bomCSV() {
  const columns = ['Part identity', 'Name', 'Internal name', 'Category', 'Revision', 'Genesis quantity', 'Genesis XL quantity', 'Notes', 'Documentation', 'CAD', 'Source commit'];
  const rows = parts.map((p) => [p.id, p.name, p.internalName, categoryName(p), p.revision, sourceQuantity(p), p.xlQuantity == null ? 'Not specified' : p.xlQuantity, p.notes, p.documentUrl, p.cadUrl, catalog.sourceCommit]);
  return '\uFEFF' + [columns, ...rows].map((r) => r.map(csvValue).join(',')).join('\r\n');
}

function renderCatalog() {
  const query = norm($('part-search').value), category = $('category-filter').value, includeAlternatives = $('show-alternatives').checked;
  const filtered = parts.filter((p) => (includeAlternatives || quantity(p) !== 0) && (category === 'all' || categoryName(p) === category) && norm([p.name, p.internalName, p.revision, JSON.stringify(p.specs), p.notes].join(' ')).includes(query));
  const body = $('parts-body'); body.replaceChildren();
  for (const p of filtered) {
    const tr = document.createElement('tr'); tr.dataset.partId = p.id; tr.dataset.selected = String(p.id === selectedPart?.id);
    const nameCell = document.createElement('td'), nameButton = element('button', p.name, 'part-name'); nameButton.addEventListener('click', () => inspectPart(p)); nameCell.append(nameButton);
    nameCell.append(element('span', [p.revision ? `Rev ${p.revision.replace(/^Rev\s*/i, '')}` : '', p.notes?.includes('Pre-') || p.notes?.includes('pre-') ? 'Includes assembly notes' : '', quantity(p) == null ? 'Quantity not specified in source' : ''].filter(Boolean).join(' · '), 'part-revision'));
    const categoryCell = element('td', categoryName(p)); const qtyCell = element('td', sourceQuantity(p)); if (quantity(p) === 0) qtyCell.className = 'quantity-zero';
    const sourceCell = document.createElement('td'), link = safeLink(p.documentUrl, 'Documentation ↗'); if (link) { link.className = 'doc-link'; sourceCell.append(link); }
    const salesCell=element('td',labels[p.commerce?.salesStatus]??'No verified sales page','sale-status '+(p.commerce?.salesStatus??'identity-unresolved'));const valueCell=element('td',money(p.commerce?.value));
    const actionCell = document.createElement('td'), action = element('button', 'Inspect ↗', 'inspect-action'); action.setAttribute('aria-label', `Inspect ${p.name}`); action.addEventListener('click', () => inspectPart(p)); actionCell.append(action);
    tr.append(nameCell, categoryCell, qtyCell, salesCell, valueCell, actionCell); body.append(tr);
  }
  $('empty-search').hidden = filtered.length > 0;
}
function appendFact(label, value) {
  if (value == null || value === '') return;
  const row = document.createElement('div'); row.append(element('dt', label), element('dd', value)); $('part-specs').append(row);
}
function inspectPart(part, mesh, { frame = true, preserveCandidates = false } = {}) {
  if (!preserveCandidates) pickCandidates = []; clearHover();
  selectedPart = part; selectedMesh = sourceBody(mesh ?? meshes.find((m) => meshBindings.get(m) === part.id)) ?? null;
  $('part-inspector').hidden = false; $('part-category').textContent = categoryName(part); $('part-title').textContent = clean(part.name);
  $('part-inspector').scrollTop = 0;
  $('part-identity').textContent = [part.internalName, part.revision ? `Rev ${part.revision}` : ''].filter(Boolean).join(' · ') || part.id;
  $('part-specs').replaceChildren(); appendFact('Genesis quantity', sourceQuantity(part));
  const comparison = reconciliationById.get(part.id);
  if (comparison) { appendFact('CAD comparison', comparison.status.replaceAll('-', ' ')); if (comparison.cadBodyCount != null) appendFact('Exact-name CAD bodies', comparison.cadBodyCount); }
  if (part.xlQuantity != null && part.xlQuantity !== quantity(part)) appendFact('Genesis XL quantity', part.xlQuantity);
  const specs = Array.isArray(part.specs) ? part.specs : Object.entries(part.specs ?? {});
  for (const spec of specs) { const [key, value] = Array.isArray(spec) ? spec : [spec.label ?? spec.name, spec.value]; if (!/^(cost|price|quantity|cad model|internal part name|revision)$/i.test(key ?? '')) appendFact(key, value); }
  $('part-notes').textContent = clean(part.notes) || 'See the source documentation for assembly and compatibility details.';
  $('part-links').replaceChildren();
  for (const [url, label] of [[part.documentUrl, 'Specifications & assembly notes ↗'], [part.cadUrl, 'Official part CAD ↗'], [part.purchaseUrl, 'Supplier product page ↗']]) { const link = safeLink(url, label); if (link) $('part-links').append(link); }
  $('farmbot-commerce').replaceChildren(renderCommerce(shopData??{id:'farmbot',title:'FarmBot Genesis v1.8',revision:'v1.8'},part,{onFindParts:()=>experience?.shell.openCatalog({contextNote:'Documented source records · confirm the installed component and replacement fit.'})}));
  const purchasing = procurementById.get(part.id);
  if (purchasing) {
    appendFact('Supplier qualification', purchasing.matchStatus?.replaceAll('-', ' '));
    for (const candidate of purchasing.supplierCandidates ?? []) {
      const link = safeLink(candidate.url, `Supplier candidate: ${candidate.title} ↗`); if (link) $('part-links').append(link);
    }
    if (purchasing.qualificationNotes) $('part-notes').textContent += ` Supplier: ${purchasing.qualificationNotes}`;
  }
  $('add-selected').disabled = quantity(part) === 0; $('add-selected').hidden = false;
  $('part-order-note').textContent = quantity(part) === 0 ? 'This alternative is not used in standard Genesis. It cannot be added to this request.' : quantity(part) == null ? 'Quantity is not specified in the source. Adding starts with one item for your review.' : 'Adds one item. Use the documented quantity and assembly notes to review your request.';
  syncSelectionGeometry();
  if (selectedMesh) { highlight(selectedMesh); if (frame) {focused=isolated;frameCurrent();} } else { clearOutline(); }
  $('isolate').disabled = !selectedMesh; if (isolated) applyIsolation(); renderSelectionControls(); renderCatalog();
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });
  $('part-title').focus({ preventScroll: true });
}
function inspectUnmapped(mesh, { frame = true, preserveCandidates = false } = {}) {
  if (!preserveCandidates) pickCandidates = []; clearHover();
  selectedPart = null; selectedMesh = sourceBody(mesh); $('part-inspector').hidden = false; $('part-inspector').scrollTop = 0; $('part-category').textContent = 'Official CAD instance'; $('part-title').textContent = selectedMesh.userData.cadName ?? selectedMesh.name ?? 'Unnamed CAD instance';
  $('farmbot-commerce').replaceChildren(renderCommerce(shopData??{id:'farmbot',title:'FarmBot Genesis v1.8',revision:'v1.8'},{id:'cad:'+selectedMesh.name,name:selectedMesh.userData.cadName??selectedMesh.name,quantity:null,commerce:{salesStatus:'identity-unresolved',offers:[],value:{amount:null,status:'price-unavailable'},notes:'Official CAD instance with no verified bill-of-materials purchasing identity.'}},{onFindParts:()=>experience?.shell.openCatalog({contextNote:'These catalog records are not verified matches for the selected CAD body.'})}));
  $('part-identity').textContent = 'Bill-of-materials match awaiting verification'; $('part-specs').replaceChildren(); appendFact('CAD node', selectedMesh.name); appendFact('Hardware version', 'Genesis v1.8'); $('part-notes').textContent = 'This geometry is retained from the official assembly. Its purchasing identity has not been verified, so it cannot be added as a guessed part.';
  $('part-links').replaceChildren(); const link = safeLink(assembly?.sourceUrl, 'Open authoritative assembly ↗'); if (link) $('part-links').append(link); $('add-selected').hidden = true; $('part-order-note').textContent = ''; $('isolate').disabled = false; syncSelectionGeometry(); highlight(selectedMesh); if (frame) {focused=isolated;frameCurrent();} if (isolated) applyIsolation(); renderSelectionControls(); renderCatalog();
  if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });
  $('part-title').focus({ preventScroll: true });
}
function closeInspector(preserveScope=true) { const returnContext=isolated||explosion?.pulled||focused||assemblyScope;focused=false; pickCandidates = []; clearHover(); $('selection-controls').hidden = true; $('part-inspector').hidden = true; selectedPart = null; selectedMesh = null; clearOutline(); isolated = false; syncSelectionGeometry(preserveScope); applyIsolation(); $('isolate').disabled = true; renderCatalog(); if(returnContext)frameCurrent(); }
function addPart(part) { if (!part || quantity(part) === 0) return; order.set(part.id, Math.min(9999, (order.get(part.id) ?? 0) + 1)); persistOrder(); renderOrder(); announce(`${part.name} added to your request`); }
function renderOrder() {
  let itemCount = 0; const container = $('order-items'); container.replaceChildren();
  for (const [id, count] of order) {
    const part = partsById.get(id); if (!part) continue; itemCount += count;
    const row = element('div', null, 'order-item'); row.append(element('h3', part.name), element('p', `Standard BOM: ${sourceQuantity(part)}${part.notes ? ` · ${part.notes}` : ''}`, 'small-copy'));
    const purchasing = procurementById.get(id);
    if (purchasing) row.append(element('p', `Supplier: ${purchasing.matchStatus.replaceAll('-', ' ')}. ${purchasing.qualificationNotes ?? ''}`, 'small-copy'));
    const link = safeLink(part.purchaseUrl ?? part.documentUrl, part.purchaseUrl ? 'Supplier product page ↗' : 'Source specifications ↗'); if (link) row.append(link);
    const controlsRow = element('div', null, 'order-item-controls'), label = element('label', 'Request quantity'); const input = document.createElement('input'); input.type = 'number'; input.min = '1'; input.max = '9999'; input.step = '1'; input.value = count; input.setAttribute('aria-label', `Quantity for ${part.name}`);
    input.addEventListener('change', () => { const value = Number(input.value); if (!Number.isInteger(value) || value < 1 || value > 9999) { input.value = order.get(id); return; } order.set(id, value); persistOrder(); renderOrder(); }); label.append(input);
    const remove = element('button', 'Remove', 'remove-item'); remove.setAttribute('aria-label', `Remove ${part.name}`); remove.addEventListener('click', () => { order.delete(id); persistOrder(); renderOrder(); }); controlsRow.append(label, remove); row.append(controlsRow); container.append(row);
  }
  $('order-count').textContent = itemCount; $('empty-order').hidden = order.size > 0; $('export-order').disabled = !order.size; $('clear-order').disabled = !order.size;
}
function exportOrder() {
  const request = { schema: 1, type: 'parts-request', configuration: catalog.configuration, hardwareRevision: catalog.revision, sourceCommit: catalog.sourceCommit, cadSourceRevision: assembly?.sourceRevision, cadSourceUrl: assembly?.sourceUrl, exportedAt: new Date().toISOString(), supplierSnapshotAt: procurement?.retrievedAt, currency: null, checkoutVerified: false, notes: 'No order submitted. Confirm part revision, supplier SKU/variant, preassembled inclusion, stock, pricing, shipping and taxes with supplier.', items: [...order].map(([id, count]) => { const p = partsById.get(id), purchase = procurementById.get(id); return { id, name: p.name, internalName: p.internalName, partRevision: p.revision, requestedQuantity: count, standardBOMQuantity: p.quantity, notes: p.notes, documentUrl: p.documentUrl, cadUrl: p.cadUrl, supplierUrl: p.purchaseUrl ?? null, procurementStatus: purchase?.matchStatus ?? 'not-verified', procurementQualificationNotes: purchase?.qualificationNotes ?? null, supplierCandidates: purchase?.supplierCandidates ?? [], cadComparison: reconciliationById.get(id) ?? null }; }) };
  download('farmbot-genesis-v1.8-parts-request.json', JSON.stringify(request, null, 2) + '\n', 'application/json'); announce('Parts request downloaded');
}

function disposeTint(group) {
  if (!group) return; renderDirty=true;scene.remove(group); group.userData.material.dispose();
}
function bodyTint(body, opacity) {
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial({ color: 0xb0d8a1, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false });
  group.userData.material = material;
  for (const source of meshes.filter((mesh) => sourceBody(mesh) === body)) {
    const ghost = new THREE.Mesh(source.geometry, material); ghost.matrixAutoUpdate = false; ghost.matrix.copy(source.matrixWorld); ghost.userData.source = source; ghost.renderOrder = 10; group.add(ghost);
  }
  scene.add(group);renderDirty=true;return group;
}
function updateTint(group) { if (group) for (const ghost of group.children) ghost.matrix.copy(ghost.userData.source.matrixWorld); }
function clearOutline() {
  disposeTint(selectedTint); selectedTint = null;
  if (!selectedOutline) return; scene.remove(selectedOutline); selectedOutline.geometry.dispose(); selectedOutline.material.dispose(); selectedOutline = null;
}
function highlight(mesh) {
  clearOutline(); selectedTint = bodyTint(mesh, .23); selectedOutline = new THREE.BoxHelper(mesh, 0xe5f4dd); selectedOutline.material.depthTest = false; selectedOutline.material.transparent = true; selectedOutline.material.opacity = .22; selectedOutline.renderOrder = 11; scene.add(selectedOutline);renderDirty=true;
}
function clearHover() { hoveredBody = null; disposeTint(hoverTint); hoverTint = null; $('cad-hover').hidden = true; if (renderer) renderer.domElement.style.cursor = 'grab'; }
function bodyName(body) { return bodyMetadata.get(body.name)?.cadName ?? body.userData.cadName ?? body.name; }
function bodyGroup(body) { const meta = bodyMetadata.get(body.name); return meta?.assemblyPath?.[1] ?? 'Source assembly'; }
function bodyContext(body) { return (bodyMetadata.get(body.name)?.assemblyPath ?? []).slice(1, -1).filter((name) => !/^occurrence of /i.test(name)).join(' / '); }
function selectBody(body, options = {}) {
  const part = partsById.get(bodyPartIds.get(body));
  if (part) inspectPart(part, body, options); else inspectUnmapped(body, options);
}
function renderSelectionControls() {
  $('selection-controls').hidden = !selectedMesh;
  if (!selectedMesh) return;
  $('selection-context').textContent = bodyContext(selectedMesh) || bodyGroup(selectedMesh);
  const siblings = selectedPart ? sourceBodies.filter((body) => bodyPartIds.get(body) === selectedPart.id) : [selectedMesh];
  const select = $('cad-instance'); select.replaceChildren();
  for (const [index, body] of siblings.entries()) { const option = element('option', `${index + 1} / ${siblings.length} · ${bodyContext(body) || bodyGroup(body)} · ${body.name}`); option.value = body.name; option.selected = body === selectedMesh; select.append(option); }
  select.disabled = siblings.length < 2;
  const hasOverlap = pickCandidates.length > 1;
  $('overlap-controls').hidden = !hasOverlap; $('overlap-details').hidden = !hasOverlap;
  $('overlap-status').textContent = `Under this point: ${pickIndex + 1} / ${pickCandidates.length}`;
  $('overlap-list').replaceChildren();
  for (const [index, body] of pickCandidates.entries()) { const button = element('button', `${index + 1}. ${bodyName(body)} · ${bodyGroup(body)}`); button.setAttribute('aria-current', String(body === selectedMesh)); button.addEventListener('click', () => chooseCandidate(index)); $('overlap-list').append(button); }
}
function chooseCandidate(index) {
  if (!pickCandidates.length) return; pickIndex = (index + pickCandidates.length) % pickCandidates.length;
  selectBody(pickCandidates[pickIndex], { frame: false, preserveCandidates: true });
}
function renderBodyBrowser() {
  const query = norm($('cad-search').value), groupFilter = $('cad-group').value;
  const filtered = sourceBodies.filter((body) => (groupFilter === 'all' || bodyGroup(body) === groupFilter) && norm([bodyName(body), body.name, bodyContext(body), partsById.get(bodyPartIds.get(body))?.name].join(' ')).includes(query));
  $('cad-results-status').textContent = `${filtered.length.toLocaleString()} of ${sourceBodies.length.toLocaleString()} source CAD bodies`;
  const groups = new Map();
  for (const body of filtered) { const key = bodyGroup(body), group = groups.get(key) ?? []; group.push(body); groups.set(key, group); }
  const list = $('cad-body-list'); list.replaceChildren();
  for (const [name, bodies] of groups) {
    const details = element('details', null, 'cad-source-group'), summary = element('summary', name); summary.append(element('span', bodies.length)); details.append(summary);
    const rows = element('div'); details.append(rows); let populated = false;
    const populate = () => { if (populated) return; populated = true; for (const body of bodies) { const button = element('button', bodyName(body), 'cad-body-button'); const part = partsById.get(bodyPartIds.get(body)); button.append(element('small', `${body.name} · ${part ? 'Verified BOM identity' : 'BOM identity awaiting verification'}`)); button.setAttribute('aria-current', String(body === selectedMesh)); button.addEventListener('click', () => { $('cad-browser').close(); selectBody(body); }); rows.append(button); } };
    details.addEventListener('toggle', () => { if (details.open) populate(); });
    if (query || groupFilter !== 'all' || bodies.includes(selectedMesh)) { details.open = true; populate(); }
    list.append(details);
  }
  if (!filtered.length) list.append(element('p', 'No source CAD bodies match. Try a component name or choose another assembly.', 'small-copy'));
}
function openBodyBrowser(onlySelection = false) {
  $('cad-search').value = ''; $('cad-group').value = onlySelection && selectedMesh ? bodyGroup(selectedMesh) : assemblyScope??'all';
  renderBodyBrowser(); $('cad-browser').showModal(); $('browse-cad').setAttribute('aria-expanded', 'true'); $('cad-search').focus();
}
function indexBodies() {
  sourceBodies.push(...new Set(meshes.map(sourceBody)));
  for (const meta of assembly.instances ?? []) bodyMetadata.set(meta.nodeName, meta);
  for (const mesh of meshes) { const id = meshBindings.get(mesh); if (id) bodyPartIds.set(sourceBody(mesh), id); }
  for (const name of [...new Set(sourceBodies.map(bodyGroup))].sort()) { const option = element('option', name); option.value = name; $('cad-group').append(option); }
  $('browse-cad').disabled = false;
  Object.assign(window.farmbotShowcase, {
    searchCadBodies(query = '') { if (typeof query !== 'string' || query.length > 200) throw new Error('Query must be at most 200 characters.'); return sourceBodies.filter((body) => norm([bodyName(body), body.name, bodyContext(body)].join(' ')).includes(norm(query))).map((body) => ({ nodeName: body.name, cadName: bodyName(body), assemblyGroup: bodyGroup(body), catalogId: bodyPartIds.get(body) ?? null })); },
    inspectCadBody(nodeName) { const body = sourceBodies.find((candidate) => candidate.name === nodeName); if (!body) throw new Error('Unknown source CAD body.'); selectBody(body); return { nodeName: body.name, catalogId: bodyPartIds.get(body) ?? null, orderingIdentityVerified: bodyPartIds.has(body) }; },
  });
}
function rayBodies(event) {
  const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
  const seen = new Set(), bodies = [];
  for (const hit of raycaster.intersectObjects(batches.filter((batch) => batch.visible), false)) {
    const original = hit.object.userData.visibleSourceMeshes[hit.instanceId]; if (!original) continue;
    const body = sourceBody(original); if (seen.has(body)) continue; seen.add(body); bodies.push(body);
  }
  return bodies;
}
function installPicking() {
  let down, lastHover = 0; const activePointers = new Set(), canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (event) => { activePointers.add(event.pointerId); down = { x: event.clientX, y: event.clientY, id: event.pointerId, dragged: activePointers.size > 1 }; clearHover(); });
  canvas.addEventListener('pointermove', (event) => {
    if (down) { if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6 || activePointers.size > 1) down.dragged = true; return; }
    if (event.pointerType !== 'mouse' || performance.now() - lastHover < 100 || animations.length) return; lastHover = performance.now();
    const body = rayBodies(event)[0]; if (!body) return clearHover();
    if (hoveredBody !== body) { clearHover(); hoveredBody = body; if (body !== selectedMesh) hoverTint = bodyTint(body, .14); }
    const tip = $('cad-hover'); tip.replaceChildren(element('b', bodyName(body)), element('span', `${bodyGroup(body)} · ${bodyPartIds.has(body) ? 'BOM identity verified' : 'BOM match awaiting verification'}`)); tip.hidden = false;
    const rect = $('viewport').getBoundingClientRect(); tip.style.left = `${Math.max(8, Math.min(event.clientX - rect.left + 16, rect.width - tip.offsetWidth - 8))}px`; tip.style.top = `${Math.max(8, Math.min(event.clientY - rect.top + 16, rect.height - tip.offsetHeight - 8))}px`; canvas.style.cursor = 'pointer';
  });
  canvas.addEventListener('pointerup', (event) => {
    activePointers.delete(event.pointerId); const start = down; down = null;
    if (!start || start.id !== event.pointerId || start.dragged || event.button !== 0 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    pickCandidates = rayBodies(event); pickIndex = 0;
    if(pickCandidates.length){const body=pickCandidates[0];experience.choose(meshes.find(m=>sourceBody(m)===body));}else experience.clearSelection();
  });
  canvas.addEventListener('pointercancel', (event) => { activePointers.delete(event.pointerId); down = null; clearHover(); });
  canvas.addEventListener('pointerleave', clearHover);
  controls.addEventListener('start', () => { animations.length = 0; clearHover(); });
}
function tweenCamera(position, target) {
  renderDirty=true;
  if (!camera || !controls) return;
  animations.length = 0;
  if (reducedMotion.matches) { camera.position.copy(position); controls.target.copy(target); controls.update(); return; }
  animations.push({ start: performance.now(), duration: 650, position: camera.position.clone(), target: controls.target.clone(), endPosition: position, endTarget: target });
}
function updateBatches() {
  for(const mesh of meshes)mesh.visible=false;
  renderDirty=true;locationCue?.update(selectedMesh?meshes.filter(m=>sourceBody(m)===selectedMesh):[],!isolated);
  for(const batch of batches) {
    const visible=batch.userData.sourceMeshes.filter(source=>experience?experience.visible(source):!isolated||sourceBody(source)===selectedMesh);
    batch.userData.visibleSourceMeshes=visible;batch.count=visible.length;batch.visible=visible.length>0;
    visible.forEach((source,index)=>batch.setMatrixAt(index,source.matrixWorld));batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();
  }
}
function syncSelectionGeometry(preserveScope=false) {
  if(experience){updateBatches();experience.refresh();return}
  if(!explosion)return;const wasFocused=isolated||explosion.pulled||focused||assemblyScope;if(selectedMesh&&assemblyScope&&bodyGroup(selectedMesh)!==assemblyScope)assemblyScope=null;if(!selectedMesh){isolated=false;focused=false;if(!preserveScope)assemblyScope=null;}
  explosion.setScope(assemblyScope);explosion.setSelection(selectedMesh?meshes.filter(m=>sourceBody(m)===selectedMesh):[]);
  updateBatches();syncExplosionUI();applyIsolation();if(wasFocused&&!selectedMesh)frameCurrent();
}
function syncExplosionUI(){if(!explosionUI)return;explosionUI.panel.hidden=!exploded;explosionUI.group.value=assemblyScope??'';explosionUI.breakdown.value=explosion.breakdown;for(const option of explosionUI.breakdown.options)option.disabled=option.value!=='assemblies'&&!assemblyScope;explosionUI.slider.value=explosion.spacing;explosionUI.value.textContent=explosion.spacing+'×';explosionUI.pull.disabled=!selectedMesh;explosionUI.pull.setAttribute('aria-pressed',String(explosion.pulled));explosionUI.pull.textContent=explosion.pulled?'Return selected part':'Separate selected part';requestAnimationFrame(resize)}
function frameBounds(box,immediate=false) {
  if(!camera||box.isEmpty())return;
  camera.clearViewOffset();
  const center=box.getCenter(new THREE.Vector3()),size=Math.max(box.getSize(new THREE.Vector3()).length(),.000001),direction=camera.position.clone().sub(controls.target).normalize();
  const distance=cameraDistance(box,camera,controls.target);
  camera.near=Math.max(size/10000,.0000001);camera.far=Math.max(distance*100,viewRadius*100);controls.minDistance=size*.002;controls.maxDistance=Math.max(size*20,viewRadius*20);camera.updateProjectionMatrix();
  const position=center.clone().addScaledVector(direction,distance);
  if(immediate||experience){animations.length=0;camera.position.copy(position);controls.target.copy(center);controls.update();renderDirty=true;}else tweenCamera(position,center);
}
function frameMesh(mesh) {frameBounds(explosion.bounds(meshes.filter(m=>sourceBody(m)===sourceBody(mesh))))}
function frameCurrent(){if(experience?.session){frameBounds(experience.session.bounds());return}if(!explosion)return;if((isolated||focused)&&selectedMesh)frameMesh(selectedMesh);else{const bounds=explosion.bounds();if(explosion.pulled&&selectedMesh)bounds.union(explosion.originBounds(meshes.filter(m=>sourceBody(m)===selectedMesh)));frameBounds(bounds)}}
function resetView() {if(experience?.session)return experience.session.reset(); assemblyScope=null;focused=false;closeInspector(); exploded=false;currentExplode=0;explosion?.reset();updateBatches();syncExplosionUI();$('explode').setAttribute('aria-pressed','false');frameCurrent(); }
function applyIsolation() { clearHover(); $('isolate').setAttribute('aria-pressed', String(isolated)); $('isolate').textContent = isolated ? 'Show full machine' : 'Isolate part'; }
function resize() {
  if (!renderer) return; const viewport=$('viewport');const inspectorPanel=$('part-inspector'),stageRect=viewport.parentElement.getBoundingClientRect();const compact=document.body.classList.contains('minimal-viewer');if(!compact&&exploded&&explosionUI&&!inspectorPanel.hidden){inspectorPanel.style.bottom=(stageRect.bottom-explosionUI.panel.getBoundingClientRect().top+16)+'px';}else inspectorPanel.style.bottom='';const reserved=compact?null:innerWidth<=600&&!inspectorPanel.hidden?inspectorPanel.getBoundingClientRect().top:exploded&&explosionUI?explosionUI.panel.getBoundingClientRect().top:null;viewport.style.height=reserved===null?'':Math.max(1,reserved-stageRect.top-16)+'px';viewport.style.width=!compact&&innerWidth>600&&!inspectorPanel.hidden?Math.max(1,inspectorPanel.getBoundingClientRect().left-stageRect.left-16)+'px':'';const rect = viewport.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  renderDirty=true;renderer.setSize(rect.width, rect.height); camera.aspect = rect.width / rect.height;
  if(compact)camera.clearViewOffset();else camera.setViewOffset(rect.width, rect.height, rect.width > 700 ? -rect.width * .12 : 0, rect.width <= 600 ? -rect.height * .11 : 0, rect.width, rect.height); camera.updateProjectionMatrix();
  const verticalFov = THREE.MathUtils.degToRad(camera.fov), horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const fitDistance = viewRadius / Math.sin(Math.min(verticalFov, horizontalFov) / 2);
  homeCamera.copy(homeTarget).add(new THREE.Vector3(1.05, .82, 1.15).normalize().multiplyScalar(fitDistance * 1.1));
  if (cameraAspect != null && Math.abs(camera.aspect / cameraAspect - 1) > .05) { animations.length = 0; frameCurrent(); }
  cameraAspect = camera.aspect; clearHover();
}
function renderFrame(time) {
  if(!renderer)return;
  if(experience?.mode==='showcase'&&controls.autoRotate&&time-lastPresentationFrame<125){requestAnimationFrame(renderFrame);return}
  lastPresentationFrame=time;const delta = Math.min((time - lastTime) / 1000 || 0, .05); lastTime = time;
  currentExplode = exploded ? 1 : 0;
  const moving=animations.length>0;
  for (const a of animations) { const t = Math.min((time - a.start) / a.duration, 1), eased = t * t * (3 - 2 * t); camera.position.lerpVectors(a.position, a.endPosition, eased); controls.target.lerpVectors(a.target, a.endTarget, eased); if (t === 1) animations.splice(animations.indexOf(a), 1); }
  const changed=controls.update();if(renderDirty||moving||changed||controls.autoRotate){updateTint(selectedTint);updateTint(hoverTint);if(selectedOutline)selectedOutline.update();renderer.render(scene,camera);renderDirty=false;}requestAnimationFrame(renderFrame);
}
function exactBinding(mesh,metadata) {
  return directBodyBinding(sourceBody(mesh),metadata,partsById,exactNames,documentaryBindings);
}
function sourceBody(mesh) { return mesh?.userData.sourceBody ?? mesh; }
function batchSourceGeometry() {
  // Preserve the original source nodes; render exact world matrices in shared GPU batches.
  const groups = new Map();
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const key = [mesh.geometry.uuid, ...materials.map((m) => m.uuid)].join(':');
    const group = groups.get(key) ?? []; group.push(mesh); groups.set(key, group); mesh.visible = false;
  }
  for (const sourceMeshes of groups.values()) {
    const first = sourceMeshes[0], batch = new THREE.InstancedMesh(first.geometry, first.material, sourceMeshes.length);
    batch.name = `CAD_batch_${batches.length}`; batch.userData.sourceMeshes = sourceMeshes; batch.userData.visibleSourceMeshes = sourceMeshes;
    sourceMeshes.forEach((mesh, index) => batch.setMatrixAt(index, mesh.matrixWorld)); batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.computeBoundingSphere(); scene.add(batch); batches.push(batch);
  }
  audit.renderBatches = batches.length;
}
async function loadModel() {
  try {
    const response = await fetch('./machines/farmbot/assembly.json'); if (!response.ok) throw new Error('Assembly export is not yet available'); assembly = await response.json();
    if (!assembly.modelUrl) throw new Error(assembly.message ?? 'Authoritative CAD export pending');
    configureNativeCadDownload(assembly.nativeCadChunkManifestUrl);
    const verified = await loadChunkedAsset(assembly.modelChunkManifestUrl, (event) => { $('model-status').textContent = event.phase === 'verify' ? 'Verifying official CAD integrity' : `Loading CAD · ${Math.round(event.loaded / event.total * 100)}%`; });
    $('model-status').textContent = 'Preparing verified CAD assembly';
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(verified.bytes.buffer, new URL('./', document.baseURI).href);
    root = gltf.scene; scene.add(root); root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    if (!Number.isFinite(size.length()) || size.length() === 0) throw new Error('CAD export contains no renderable bounds');
    viewRadius = size.length() / 2; homeTarget.copy(center);
    const modelMetadata = new Map((assembly.instances ?? []).map((i) => [i.nodeName, i]));
    const bindingsResponse=await fetch('./machines/farmbot/purchasing-bindings.json');if(!bindingsResponse.ok)throw Error('Documentary part bindings unavailable');
    const bindings=await bindingsResponse.json();if(bindings.sourceCadSha256!=='8ff533f07be517290b297b100aa701c8267a62d6d8f071d01d611047cf0af34e')throw Error('Documentary bindings do not match native CAD');
    for(const entry of bindings.entries){if(!modelMetadata.has(entry.nodeName)||!partsById.has(entry.catalogId)||documentaryBindings.has(entry.nodeName))throw Error('Invalid documentary part binding');documentaryBindings.set(entry.nodeName,entry.catalogId)}
    root.traverse((node) => { const meta = modelMetadata.get(node.name); if (meta) { node.userData.cadName = meta.cadName; if (meta.partId) node.userData.catalogId = meta.partId; } });
    root.traverse((node) => { if (!node.isMesh) return; meshes.push(node); let metadata, ancestor = node, body = node; while (ancestor && !metadata) { metadata = modelMetadata.get(ancestor.name); if (metadata) body = ancestor; ancestor = ancestor.parent; } node.userData.sourceBody = body; node.userData.cadName = metadata?.cadName ?? node.userData.cadName ?? node.userData.name ?? node.name;
      const id = exactBinding(node, metadata); if (id) meshBindings.set(node, id);
      homePose.set(node, {position:node.position.clone(),offset:new THREE.Vector3()});
    });
    const nativeGroups=await fetch('./farmbot-explosion-groups.json').then(r=>{if(!r.ok)throw Error('Native assembly breakdown unavailable');return r.json()});
    if(nativeGroups.sourceSha256!=='8ff533f07be517290b297b100aa701c8267a62d6d8f071d01d611047cf0af34e'||meshes.some(m=>!nativeGroups.groupByBody[sourceBody(m).name]))throw Error('Native assembly breakdown does not match source CAD');
    explosion=new AssemblyExplosion(root,meshes,m=>modelMetadata.get(sourceBody(m).name)?.assemblyPath?.[1]??'Source assembly',sourceBody,()=>false,{componentGroupOf:m=>nativeGroups.groupByBody[sourceBody(m).name]});
    locationCue=new SelectionLocationCue(scene,explosion);
    explosionUI=explosionControls(document.querySelector('.view-toolbar'),amount=>{explosion.setSpacing(amount);updateBatches();frameCurrent()},()=>{explosion.setPulled(!explosion.pulled);updateBatches();syncExplosionUI();frameCurrent()},[...explosion.assemblyGroups.keys()],group=>{closeInspector(false);assemblyScope=group||null;explosion.setScope(assemblyScope);focused=false;updateBatches();syncExplosionUI();frameCurrent()},mode=>{explosion.setPulled(false);if(mode==='assemblies'){assemblyScope=null;explosion.setScope(null)}explosion.setBreakdown(mode);focused=false;isolated=false;applyIsolation();updateBatches();syncExplosionUI();frameCurrent()});
    Object.assign(window.farmbotShowcase,{getLocationCue:()=>locationCue.diagnostics(),getExplosionDiagnostics:()=>experience?.session?.diagnostics()??explosion.diagnostics(),getSourceBodies:()=>sourceBodies,selectBody,getCamera:()=>camera,getControls:()=>controls,getExplosion:()=>explosion});
    const rect = $('viewport').getBoundingClientRect(); renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, rect.width <= 600 ? 1.5 : 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .8; $('viewport').append(renderer.domElement);
    camera = new THREE.PerspectiveCamera(35, rect.width / rect.height, Math.max(viewRadius / 5000, .0001), viewRadius * 100);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov), horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const fitDistance = viewRadius / Math.sin(Math.min(verticalFov, horizontalFov) / 2); homeCamera.copy(center).add(new THREE.Vector3(1.05, .82, 1.15).normalize().multiplyScalar(fitDistance * 1.1)); camera.position.copy(homeCamera);
    controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(center); controls.enableDamping = !reducedMotion.matches; controls.dampingFactor = .09; controls.minDistance = viewRadius * .003; controls.maxDistance = viewRadius * 20; controls.maxPolarAngle = Math.PI * .95;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x30343a, .65)); const key = new THREE.DirectionalLight(0xffffff, .8); key.position.copy(center).add(new THREE.Vector3(viewRadius, viewRadius * 2, viewRadius)); scene.add(key);
    const pmrem = new THREE.PMREMGenerator(renderer); const room = new RoomEnvironment(renderer); const environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; room.dispose(); pmrem.dispose();
    try {
      const finishResponse = await fetch('./machines/farmbot/appearance.json');
      if (!finishResponse.ok) throw new Error('Documented finish references unavailable');
      audit.appearance = applyFarmbotAppearance(root, await finishResponse.json(), assembly);
    } catch (error) { audit.appearance = { displayOnly: true, applied: false, error: error.message }; }
    batchSourceGeometry(); indexBodies();
    experience=createPlatformExperience({root,meshes,camera,controls,presentationMotion:false,bodyOf:sourceBody,surface:document.querySelector('.stage'),toolbar:document.querySelector('.view-toolbar'),title:'FarmBot Genesis v1.8',parts:shopData?.parts??parts,resolvePartMeshes:p=>meshes.filter(m=>meshBindings.get(m)===p.id),depthNote:n=>n.body?.userData.cadName==='Camera'?'Camera includes attached cable and connector · no deeper source CAD':'Single CAD body · deeper subparts are not supplied',showPart:p=>inspectPart(p,null,{frame:false}),selectMesh:m=>selectBody(sourceBody(m),{frame:false,preserveCandidates:true}),clearPart:()=>closeInspector(),fit:box=>{animations.length=0;frameBounds(box,true)},sync:()=>updateBatches(),invalidate:()=>renderDirty=true,cancelMotion:()=>{animations.length=0;clearHover()}});
    window.farmbotShowcase.experience=experience;
    resize(); const layoutObserver=new ResizeObserver(resize);layoutObserver.observe($('viewport'));layoutObserver.observe($('part-inspector'));layoutObserver.observe(explosionUI.panel);
    $('explode').disabled = false; $('model-status').textContent = 'Official CAD assembly'; $('stage-status').classList.add('ready'); $('geometry-summary').textContent = `${assembly.metrics.bodyInstances.toLocaleString()} CAD bodies retained · BOM differences ↗`;
    $('coverage-status').textContent = assembly.coverageLabel ?? 'Export loaded · BOM reconciliation pending';
    $('assembly-revision').textContent = `Genesis v1.8 · ${assembly.sourceRevision} · Standard`;
    $('source-message').hidden = true; $('retry-cad').hidden = true; $('reset-view').disabled = false;
    audit.modelLoaded = true; audit.renderedMeshes = meshes.length; audit.mappedMeshes = meshBindings.size;
    installPicking();
    $('viewport').addEventListener('keydown', (event) => { if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(event.key)) return; event.preventDefault(); if (event.key === '0') return experience.session.reset(); const offset = camera.position.clone().sub(controls.target); if (['+','=','-'].includes(event.key)) offset.multiplyScalar(event.key === '-' ? 1.12 : .89); else { const spherical = new THREE.Spherical().setFromVector3(offset); if (event.key === 'ArrowLeft') spherical.theta -= .1; if (event.key === 'ArrowRight') spherical.theta += .1; if (event.key === 'ArrowUp') spherical.phi -= .1; if (event.key === 'ArrowDown') spherical.phi += .1; spherical.makeSafe(); offset.setFromSpherical(spherical); } camera.position.copy(controls.target).add(offset); controls.update(); });
    requestAnimationFrame(renderFrame);
  } catch (error) { $('retry-cad').hidden = false; audit.failures.push(error.message); $('source-message').hidden = false; $('source-message-copy').textContent = `The complete CAD assembly is not available in this build. ${error.message}. All acquired parts remain listed below.`; $('model-status').textContent = 'CAD assembly pending'; $('stage-status').classList.add('ready'); $('geometry-summary').textContent = 'No substitute machine geometry'; $('reset-view').disabled = true; }
}
async function start() {
  try {
    const response = await fetch('./machines/farmbot/catalog.json'); if (!response.ok) throw new Error(`Official parts catalog unavailable (${response.status})`); catalog = await response.json(); parts = catalog.parts;
    try{shopData=await machineData('farmbot');parts=parts.map(p=>({...p,...shopData.parts.find(x=>x.id===p.id)}))}catch{}
    if (!Array.isArray(parts) || !parts.length) throw new Error('Official catalog is empty');
    for (const p of parts) { partsById.set(p.id, p); for (const name of new Set([p.name, p.internalName].filter(Boolean).map(norm))) { const ids = exactNames.get(name) ?? []; ids.push(p.id); exactNames.set(name, ids); } }
    for (const c of [...new Set(parts.map(categoryName))].sort()) { const option = element('option', c); option.value = c; $('category-filter').append(option); }
    const standard = parts.filter((p) => quantity(p) > 0), unspecified = parts.filter((p) => quantity(p) == null);
    $('catalog-summary').textContent = `${standard.length} standard component entries · ${unspecified.length} entries with unspecified quantities. Full source list retained.`; $('bom-verification').textContent = `${parts.length} entries · pinned documentation source`;
    if (catalog.dimensions) $('source-dimensions').textContent = `${catalog.dimensions.gantryWidth} gantry · ${catalog.dimensions.trackLength} tracks · ${catalog.dimensions.area} growing area`;
    for (const issue of catalog.dataIssues ?? []) $('source-issues').append(element('li', issue.detail));
    $('source-issues-summary').textContent = `${(catalog.dataIssues ?? []).length} source gaps and revision differences`;
    $('export-bom').disabled = false; audit.catalogLoaded = true;
    try { const comparisonResponse = await fetch('./docs/research/farmbot/CATALOG_CAD_RECONCILIATION.json'); if (comparisonResponse.ok) { const comparison = await comparisonResponse.json(); for (const row of comparison.rows) reconciliationById.set(row.catalogId, row); } } catch { /* The assembly remains visibly unqualified when comparison data is unavailable. */ }
    try {
      const supplierResponse = await fetch('./machines/farmbot/procurement.json'); if (!supplierResponse.ok) throw new Error('Supplier snapshot unavailable'); procurement = await supplierResponse.json();
      for (const p of procurement.parts ?? []) procurementById.set(p.catalogId, p);
      const date = new Date(procurement.retrievedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      $('kit-availability').textContent = `${procurement.kit.availableAtSnapshot ? 'Available' : 'Sold out'} at ${date} snapshot`;
    } catch { $('kit-availability').textContent = 'Supplier stock not verified'; }
    try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]'); if (Array.isArray(saved)) for (const [id, count] of saved) { if (partsById.has(id) && partsById.get(id).quantity !== 0 && Number.isInteger(count) && count > 0 && count <= 9999) order.set(id, count); } } catch { /* Corrupt storage does not block the catalog. */ }
    renderCatalog(); renderOrder(); await loadModel();const deepLink=new URLSearchParams(location.search).get('part');if(deepLink){const p=partsById.get(deepLink)??shopData?.parts.find(x=>x.id===deepLink);if(p)experience.openPart(p)} window.dispatchEvent(new Event('farmbot:ready'));
  } catch (error) { audit.failures.push(error.message); $('catalog-summary').textContent = error.message; $('source-message').hidden = false; $('source-message-copy').textContent = 'Source acquisition has not completed. No guessed parts or geometry are shown.'; $('model-status').textContent = 'Source data unavailable'; }
}
$('part-search').addEventListener('input', renderCatalog); $('category-filter').addEventListener('change', renderCatalog); $('show-alternatives').addEventListener('change', renderCatalog);
$('close-inspector').addEventListener('click', ()=>experience?.clearSelection()); $('add-selected').addEventListener('click', () => addPart(selectedPart));
$('reset-view').addEventListener('click', resetView); $('explode').addEventListener('click', () => {if(experience?.session)return experience.session.setExploded(!experience.session.exploded); exploded=!exploded;explosion.setEnabled(exploded);if(!exploded){explosion.setPulled(false);assemblyScope=null;explosion.setScope(null);}focused=isolated;updateBatches();syncExplosionUI();$('explode').setAttribute('aria-pressed',String(exploded));frameCurrent();if(!document.body.classList.contains('minimal-viewer'))announce(exploded?'The full machine stays visible. Choose an assembly for gentle separation, then select the part you need.':'Source assembly positions restored'); });
$('isolate').addEventListener('click', () => {if(experience?.session)return experience.session.setIsolated(!experience.session.isolated);if(!selectedMesh)return;isolated=!isolated;focused=isolated;applyIsolation();updateBatches();frameCurrent();});
$('order-toggle').addEventListener('click', () => { $('order-panel').showModal(); $('order-toggle').setAttribute('aria-expanded', 'true'); }); $('close-order').addEventListener('click', () => $('order-panel').close()); $('order-panel').addEventListener('close', () => { $('order-toggle').setAttribute('aria-expanded', 'false'); $('order-toggle').focus(); });
$('export-order').addEventListener('click', exportOrder); $('clear-order').addEventListener('click', () => { order.clear(); persistOrder(); renderOrder(); }); $('export-bom').addEventListener('click', () => download('farmbot-genesis-v1.8-complete-bom.csv', bomCSV(), 'text/csv;charset=utf-8'));
$('browse-cad').addEventListener('click', () => openBodyBrowser());
$('close-cad-browser').addEventListener('click', () => $('cad-browser').close());
$('cad-browser').addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); $('cad-browser').close(); } });
$('cad-browser').addEventListener('close', () => { $('browse-cad').setAttribute('aria-expanded', 'false'); $('browse-cad').focus({ preventScroll: true }); });
$('cad-search').addEventListener('input', renderBodyBrowser); $('cad-group').addEventListener('change', renderBodyBrowser);
$('focus-part').addEventListener('click', () => { if (selectedMesh) {isolated=true;focused=true;applyIsolation();updateBatches();frameCurrent();} });
$('browse-instance').addEventListener('click', () => openBodyBrowser(true));
$('cad-instance').addEventListener('change', () => { const body = sourceBodies.find((candidate) => candidate.name === $('cad-instance').value); if (body) selectBody(body); });
$('previous-hit').addEventListener('click', () => chooseCandidate(pickIndex - 1)); $('next-hit').addEventListener('click', () => chooseCandidate(pickIndex + 1));
document.addEventListener('keydown', (event) => {if(experience&&event.key==='Escape'&&!$('cad-browser').open&&!$('order-panel').open){event.preventDefault();experience.session.back();return} if (event.key === 'Escape' && !$('cad-browser').open && !$('order-panel').open && (selectedMesh || selectedPart || assemblyScope)) { event.preventDefault(); closeInspector(false); $('viewport').focus({ preventScroll: true }); } });
start();

$('retry-cad').addEventListener('click', () => location.reload());
