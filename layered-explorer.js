import * as THREE from 'three';

const AXES = ['x', 'y', 'z'];
const delta = (a, b) => Math.max(...a.elements.map((v, i) => Math.abs(v - b.elements[i])));

/** Source-preserving, next-layer assembly navigation. This is a presentation tree,
 * never a purchasing identity. The callbacks may update existing inspectors and
 * render batches; the canonical source pose is reapplied afterwards. */
export class LayeredExplorer {
  constructor({root, meshes, bodyOf = m => m.userData.bodyObject ?? m,
    unitOf, majorOf, nativeUnits = false, isReference = () => false, title = 'Machine',
    onChange = () => {}, onPart = () => {}, onClear = () => {},
    fit = () => {}, renderSync = () => {}}) {
    if (!root?.isObject3D || !Array.isArray(meshes) || !meshes.length) throw new TypeError('A source Object3D and retained meshes are required.');
    this.root = root; this.meshes = [...meshes]; this.bodyOf = bodyOf;
    this.isReference = isReference; this.onChange = onChange; this.onPart = onPart;
    this.onClear = onClear; this.fit = fit; this.renderSync = renderSync;
    this.exploded = false; this.isolated = false; this.selected = null;
    this.nodes = new Map(); this._owners = new Map(); this._offsets = new Map(); this._offsetFallbacks = 0; this._offsetUniquenessCorrections = 0;
    root.updateMatrixWorld(true);
    this._sources = []; this._sourceByNode = new Map();
    root.traverse(node => {
      const record = {node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
        matrix: node.matrix.clone(), world: node.matrixWorld.clone(), visible: node.visible, matrixAutoUpdate: node.matrixAutoUpdate};
      this._sources.push(record); this._sourceByNode.set(node, record);
    });
    const supplied = new Set();
    this._meshBounds = new Map();
    for (const mesh of this.meshes) {
      if (!mesh?.isMesh || !mesh.geometry || !this._sourceByNode.has(mesh) || supplied.has(mesh)) throw new Error('Retained meshes must be unique source descendants with geometry.');
      supplied.add(mesh);
      // Never compute or assign a bounding box on the user's source geometry.
      const local = mesh.geometry.boundingBox?.clone() ?? new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
      this._meshBounds.set(mesh, local.applyMatrix4(mesh.matrixWorld));
    }
    this.tree = this._node('machine', title, null, false);
    this.tree.kind = 'machine';
    this.scope = this.tree; this.scopeId = null;
    const bodies = new Map();
    for (const mesh of this.meshes) {
      const key = bodyOf(mesh);
      if (key == null) throw new Error('Every retained mesh requires an atomic source body.');
      const list = bodies.get(key) ?? []; list.push(mesh); bodies.set(key, list);
    }
    let serial = 0;
    const sourceGroups = new Map();
    const ancestorGroup = node => {
      if (!node || node === root) return this.tree;
      if (!this._sourceByNode.has(node)) throw new Error('A source body owner is outside the retained root.');
      if (sourceGroups.has(node)) return sourceGroups.get(node);
      const parent = ancestorGroup(node.parent);
      const group = this._node('source:' + serial++, node.userData.cadName ?? node.userData.sourceLabel ?? node.name ?? 'Source assembly', parent, false);
      group.sourceNode = node; sourceGroups.set(node, group); return group;
    };
    const genericGroups = new Map();
    const nativeUnitGroups = new Map();
    if (nativeUnits) {
      if (!unitOf) throw new TypeError('Native component hierarchy requires persisted unit membership.');
      const unitMembers = new Map();
      for (const mesh of this.meshes) {
        const unit = unitOf(mesh), key = unit && typeof unit === 'object' ? unit.id : unit;
        if (key == null) throw new Error('Missing persisted component unit membership.');
        const record = unitMembers.get(key) ?? {unit, members: []};
        record.members.push(mesh); unitMembers.set(key, record);
      }
      for (const [key, {unit, members}] of unitMembers) {
        // Every authored unit is inserted beneath the lowest actual source
        // ancestor above its body owners, not an inferred semantic section.
        const parents = members.map(mesh => {
          const body = bodyOf(mesh);
          return body?.isObject3D ? body.parent ?? root : mesh.parent ?? root;
        });
        let common = parents[0];
        while (common && !parents.every(node => { for(let p=node;p;p=p.parent) if(p===common) return true; return false; })) common=common.parent;
        if (!common || !this._sourceByNode.has(common)) throw new Error('Component unit has no shared retained source ancestor.');
        const parent = ancestorGroup(common);
        const group = this._node('unit:' + String(key), typeof unit === 'object' ? unit.displayName ?? unit.name ?? String(key) : String(unit), parent, false);
        group.unit = unit; group.kind = 'authored-group'; group.sourceNode = common;
        nativeUnitGroups.set(key, group);
      }
    }
    for (const [body, members] of bodies) {
      let parent;
      if (nativeUnits) {
        const units=members.map(unitOf), key=units[0] && typeof units[0] === 'object' ? units[0].id : units[0];
        if(units.some(unit => (unit && typeof unit === 'object' ? unit.id : unit) !== key)) throw new Error('An atomic source body crosses component boundaries.');
        parent = nativeUnitGroups.get(key);
      } else if (unitOf || majorOf) {
        const major = majorOf ? majorOf(members[0]) : members[0].userData.explosionGroup ?? 'Source assembly';
        const majorKey = typeof major === 'object' ? major.id : major;
        if (majorKey == null) throw new Error('Missing source assembly membership.');
        const units = members.map(m => unitOf?.(m) ?? null);
        const unit = units[0], unitKey = unit && typeof unit === 'object' ? unit.id : unit;
        if (members.some((m, i) => { const other=majorOf ? majorOf(m) : m.userData.explosionGroup ?? 'Source assembly'; return (other && typeof other === 'object' ? other.id : other) !== majorKey || (units[i] && typeof units[i] === 'object' ? units[i].id : units[i]) !== unitKey; })) throw new Error('An atomic source body crosses assembly/component boundaries.');
        const mk = 'major:' + String(majorKey);
        if (!genericGroups.has(mk)) genericGroups.set(mk, this._node(mk, typeof major === 'object' ? major.label ?? major.name ?? String(majorKey) : String(major), this.tree, false));
        parent = genericGroups.get(mk);
        if (unitKey != null) {
          const uk = mk + '/unit:' + String(unitKey);
          if (!genericGroups.has(uk)) {
            const group = this._node(uk, typeof unit === 'object' ? unit.displayName ?? unit.name ?? String(unitKey) : String(unit), parent, false);
            group.unit = unit;
            // Persisted units group their actual source bodies. They remain a
            // navigation layer; geometry/material primitive count never proves
            // purchasing identity or a package-only sale.
            group.kind = 'authored-group'; genericGroups.set(uk, group);
          }
          parent = genericGroups.get(uk);
        }
      } else {
        // The canonical multipart body owner is above all of its primitives.
        let owner = body?.isObject3D ? body : members[0];
        if (!body?.isObject3D && members.length > 1) {
          while (owner && !members.every(m => { for (let p=m; p; p=p.parent) if (p===owner) return true; return false; })) owner=owner.parent;
        }
        if (!owner || !this._sourceByNode.has(owner)) throw new Error('Cannot locate a retained atomic body owner.');
        parent = owner === root ? this.tree : ancestorGroup(owner.parent);
      }
      const first = members[0];
      const label = body?.userData?.cadName ?? first.userData.cadName ?? first.userData.sourceName ?? body?.name ?? first.name ?? 'Source body';
      const leaf = this._node(parent.id + '/body:' + serial++, label, parent, true);
      leaf.body = body; leaf.members = members; leaf.representative = first;
      for (const mesh of members) this._owners.set(mesh, leaf);
    }
    const compress = node => {
      node.children = node.children.map(child => {
        compress(child);
        while (child.kind === 'native-assembly' && child.children.length === 1) { this.nodes.delete(child.id); child=child.children[0]; }
        child.parent = node; return child;
      });
      node.members = node.leaf ? node.members : node.children.flatMap(child => child.members);
      node.bounds = new THREE.Box3();
      for (const mesh of node.members) if (!isReference(mesh)) node.bounds.union(this._meshBounds.get(mesh));
      node.meshCount = node.members.length;
      node.bodyCount = new Set(node.members.map(bodyOf)).size;
      node.primitiveCount = node.meshCount;
      node.sourceBodyCount = node.bodyCount;
      // Only a source-body owner is the indivisible geometric boundary. A
      // singleton authored unit may disable explode but stays drillable.
      node.atomic = node.leaf || (node.kind === 'authored-group' && node.bodyCount === 1);
    };
    compress(this.tree);
    // Native scene export wrappers shared by every unit are transparent at the
    // machine level. Authored grouping is retained even for a single body.
    while(this.tree.children.length === 1 && this.tree.children[0].kind === 'native-assembly') {
      const wrapper=this.tree.children[0]; this.nodes.delete(wrapper.id);
      this.tree.children=wrapper.children; this.tree.children.forEach(child=>child.parent=this.tree);
    }
    const assignDepth = (node, depth) => { node.depth = depth; node.children.forEach(child => assignDepth(child, depth + 1)); };
    assignDepth(this.tree, 0);
    if (this._owners.size !== this.meshes.length) throw new Error('Presentation tree does not cover every retained primitive.');
    // No callbacks in the constructor: adapters assign their session first.
  }

  _node(id, label, parent, leaf) {
    if (this.nodes.has(id)) throw new Error('Duplicate presentation hierarchy ID: ' + id);
    const node={id, label: String(label || 'Source assembly'), parent, leaf, kind: leaf ? 'source-body' : 'native-assembly', children: [], members: []};
    this.nodes.set(id,node); parent?.children.push(node); return node;
  }
  children(id = this.scope.id) { return [...(id == null ? this.tree : this.nodes.get(id))?.children ?? []]; }
  breadcrumbs() { const path=[]; for(let n=this.scope;n;n=n.parent) path.unshift(n); return path; }
  meshesFor(id = this.scope.id) { return [...(id == null ? this.tree : this.nodes.get(id))?.members ?? []]; }
  ownerOf(mesh) { return this._owners.get(mesh) ?? null; }
  visible(mesh) {
    if (!this._owners.has(mesh) || this.isReference(mesh)) return false;
    if (this.isolated && this.selected) return this.selected.members.includes(mesh);
    return this.scope.members.includes(mesh);
  }
  choose(mesh) {
    let node=this.ownerOf(mesh);
    if(!node || !this.visible(mesh)) return null;
    while(node.parent && node.parent !== this.scope) node=node.parent;
    if(node.parent !== this.scope && node !== this.scope) return null;
    if(!node.leaf) { this.enter(node.id); return {type:'enter',node}; }
    this.selected=node; this.isolated=false;
    this.onPart(mesh,node); this.apply({frame:false});
    return {type:'part',node};
  }
  enter(id) {
    const node=id == null ? this.tree : this.nodes.get(id);
    if(!node) throw new RangeError('Unknown exploration scope: ' + id);
    if(node.leaf) { this.selected=node; this.onPart(node.representative,node); this.apply({frame:false}); return this; }
    this.scope=node; this.scopeId=node === this.tree ? null : node.id;
    this.selected=null; this.isolated=false; this.exploded=false;
    this.onClear(); return this.apply({frame:true});
  }
  back() { return this.enter(this.scope.parent?.id ?? null); }
  home() { return this.enter(null); }
  clearSelection() { this.selected=null; this.isolated=false; this.onClear(); return this.apply({frame:false}); }
  setExploded(enabled) { this.exploded=!!enabled && !this.scope.atomic && this.children().length>1; return this.apply({frame:true}); }
  setIsolated(enabled) { this.isolated=!!enabled && !!this.selected; return this.apply({frame:true}); }
  _restoreAll() {
    for(const r of this._sources) {
      r.node.position.copy(r.position); r.node.quaternion.copy(r.quaternion); r.node.scale.copy(r.scale);
      r.node.matrix.copy(r.matrix); r.node.visible=r.visible; r.node.matrixAutoUpdate=r.matrixAutoUpdate;
      r.node.matrixWorldNeedsUpdate=true;
    }
    this.root.updateMatrixWorld(true);
  }
  restore() { this.exploded=false; this.isolated=false; this.selected=null; this.scope=this.tree; this.scopeId=null; this._offsets.clear(); this._offsetFallbacks = 0; this._offsetUniquenessCorrections = 0; this._restoreAll(); this.renderSync(this); return this; }
  reset() { this.onClear(); this.restore(); this.onChange(this); this.fit(this.bounds()); return this; }
  _plan() {
    this._offsets.clear(); this._offsetFallbacks = 0; this._offsetUniquenessCorrections = 0;
    const children=this.children();
    if(!this.exploded || this.scope.atomic || children.length<2 || this.scope.bounds.isEmpty()) return;
    const size=this.scope.bounds.getSize(new THREE.Vector3());
    const center=this.scope.bounds.getCenter(new THREE.Vector3());
    const plans=children.map(child => {
      const offset=child.bounds.isEmpty() ? new THREE.Vector3() : child.bounds.getCenter(new THREE.Vector3()).sub(center).multiplyScalar(.16);
      for(const axis of AXES) offset[axis]=THREE.MathUtils.clamp(offset[axis],-size[axis]*.06,size[axis]*.06);
      return {child,offset,tiedFallback:false};
    });
    // Concentric bodies (for example a wheel and rim) have the same radial
    // offset. Keep their source poses/bases and separate only these tied
    // siblings with small, centered slots along the shortest nondegenerate
    // geometric axis. This is a presentation offset, never a removal path.
    const scale=Math.max(size.x,size.y,size.z), tolerance=scale*1e-8;
    const axis=AXES.filter(axis=>size[axis]>scale*1e-6).sort((a,b)=>size[a]-size[b] || AXES.indexOf(a)-AXES.indexOf(b))[0];
    if(axis) {
      const remaining=new Set(plans.filter(plan=>!plan.child.bounds.isEmpty()));
      for(const plan of [...remaining]) {
        if(!remaining.delete(plan)) continue;
        const tied=[plan];
        for(const other of remaining) if(other.offset.distanceTo(plan.offset)<=tolerance) { tied.push(other); remaining.delete(other); }
        if(tied.length<2) continue;
        tied.sort((a,b)=>a.child.id<b.child.id?-1:a.child.id>b.child.id?1:0);
        const cap=size[axis]*.06;
        tied.forEach((entry,index)=>{ entry.offset[axis]=cap*(2*index/(tied.length-1)-1); entry.tiedFallback=true; });
        this._offsetFallbacks++;
      }
    }
    // Independent tied clusters can converge on the same cap, or on an
    // otherwise unique sibling's radial offset. Reserve all distinct resulting
    // offsets first, then relocate only collisions to nearby interior slots.
    // Source geometry is never packed or recentered.
    const reserved=[], collisions=[];
    for(const entry of [...plans].sort((a,b)=>Number(a.tiedFallback)-Number(b.tiedFallback) || (a.child.id<b.child.id?-1:a.child.id>b.child.id?1:0))) {
      if(reserved.some(other=>other.offset.distanceTo(entry.offset)<=tolerance)) collisions.push(entry);
      else reserved.push(entry);
    }
    const availableAxes=AXES.filter(axis=>size[axis]>scale*1e-6).sort((a,b)=>size[a]-size[b] || AXES.indexOf(a)-AXES.indexOf(b));
    const slots=plans.length*2+1;
    for(const entry of collisions) {
      let resolved=false;
      for(const axis of availableAxes) {
        const cap=size[axis]*.06;
        const candidates=Array.from({length:slots},(_,i)=>-cap+2*cap*(i+1)/(slots+1));
        candidates.sort((a,b)=>Math.abs(a-entry.offset[axis])-Math.abs(b-entry.offset[axis]) || a-b);
        for(const value of candidates) {
          const candidate=entry.offset.clone(); candidate[axis]=value;
          if(reserved.some(other=>other.offset.distanceTo(candidate)<=tolerance)) continue;
          entry.offset.copy(candidate); resolved=true; break;
        }
        if(resolved) break;
      }
      reserved.push(entry);
      if(resolved) this._offsetUniquenessCorrections++;
    }
    for(const {child,offset} of plans) for(const mesh of child.members) if(!this.isReference(mesh)) this._offsets.set(mesh,offset);
  }
  apply({frame=false} = {}) {
    this._restoreAll(); this._plan();
    // Source node preorder prevents a translated Mesh parent being applied twice
    // to its Mesh descendants. Each desired world pose is canonical + one offset.
    for(const r of this._sources) {
      const node=r.node;
      if(this._owners.has(node)) {
        const desired=r.world.clone(); const offset=this._offsets.get(node);
        if(offset) { desired.elements[12]+=offset.x; desired.elements[13]+=offset.y; desired.elements[14]+=offset.z; }
        const local=node.parent ? node.parent.matrixWorld.clone().invert().multiply(desired) : desired;
        // Translation-only layout preserves exact source quaternion/scale/basis.
        node.position.set(local.elements[12],local.elements[13],local.elements[14]);
        node.matrix.copy(r.matrix); node.matrix.elements[12]=local.elements[12]; node.matrix.elements[13]=local.elements[13]; node.matrix.elements[14]=local.elements[14];
        node.visible=this.visible(node);
      }
      if(node.matrixAutoUpdate) node.updateMatrix();
      if(node.parent) node.matrixWorld.multiplyMatrices(node.parent.matrixWorld,node.matrix); else node.matrixWorld.copy(node.matrix);
      node.matrixWorldNeedsUpdate=false;
    }
    this.root.updateMatrixWorld(true);
    this.renderSync(this); this.onChange(this);
    if(frame) this.fit(this.bounds()); return this;
  }
  bounds(meshes = this.meshes.filter(m=>this.visible(m))) {
    const box=new THREE.Box3();
    for(const mesh of meshes) {
      const source=this._sourceByNode.get(mesh);
      const transform=mesh.matrixWorld.clone().multiply(source.world.clone().invert());
      box.union(this._meshBounds.get(mesh).clone().applyMatrix4(transform));
    }
    return box;
  }
  tick() { /* Animation belongs to the camera adapter, never source geometry. */ }
  diagnostics() {
    this.root.updateMatrixWorld(true);
    let restored=true, rigid=true; const errors=[], bodyOffsets=new Map();
    for(const r of this._sources) {
      if(delta(r.node.matrix,r.matrix)>1e-7 || delta(r.node.matrixWorld,r.world)>1e-7) restored=false;
      if(!r.node.matrixWorld.elements.every(Number.isFinite)) errors.push('Non-finite source transform: '+r.node.name);
    }
    for(const mesh of this.meshes) {
      const source=this._sourceByNode.get(mesh), actual=new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(source.world));
      const expected=this._offsets.get(mesh) ?? new THREE.Vector3();
      if(actual.distanceTo(expected)>1e-6) errors.push('Source offset mismatch: '+mesh.name);
      const body=this.bodyOf(mesh), previous=bodyOffsets.get(body);
      if(previous && previous.distanceTo(actual)>1e-6) rigid=false;
      bodyOffsets.set(body,actual);
      const desired=source.world.clone(); desired.elements[12]+=expected.x; desired.elements[13]+=expected.y; desired.elements[14]+=expected.z;
      if(delta(mesh.matrixWorld,desired)>1e-6) errors.push('Source basis mismatch: '+mesh.name);
    }
    const sourceSize=this.scope.bounds.getSize(new THREE.Vector3()), expanded=this.bounds().getSize(new THREE.Vector3());
    const leaves=[...this.nodes.values()].filter(node=>node.leaf);
    return {scopeId:this.scopeId, scopeKind:this.scope.kind, scopeDepth:this.scope.depth, atomic:!!this.scope.atomic, exploded:this.exploded, isolated:this.isolated, selectedId:this.selected?.id ?? null,
      meshCount:this.meshes.length, ownedMeshCount:this._owners.size, scopedMeshCount:this.scope.meshCount,
      primitiveCount:this.tree.primitiveCount, sourceBodyCount:this.tree.sourceBodyCount, scopedSourceBodyCount:this.scope.sourceBodyCount,
      authoredGroupCount:[...this.nodes.values()].filter(node=>node.kind==='authored-group').length,
      minLeafDepth:Math.min(...leaves.map(node=>node.depth)), maxLeafDepth:Math.max(...leaves.map(node=>node.depth)),
      terminalSourceBodyCountMax:Math.max(...leaves.map(node=>node.sourceBodyCount)), terminalLimit:'single-source-body',

      visibleMeshCount:this.meshes.filter(m=>this.visible(m)).length, nodeCount:this.nodes.size, childCount:this.children().length,
      sourcePoseRestored:restored, allSourceMatricesRestored:restored, bodiesRigid:rigid, groupsRigid:!errors.length,
      sourceExtent:sourceSize.toArray(), expandedExtent:expanded.toArray(), perAxisSideCap:.06, offsetFallbackGroupCount:this._offsetFallbacks, offsetUniquenessCorrections:this._offsetUniquenessCorrections,
      children:this.children().map(n=>({id:n.id,label:n.label,kind:n.kind,depth:n.depth,leaf:n.leaf,atomic:n.atomic,meshCount:n.meshCount,primitiveCount:n.primitiveCount,bodyCount:n.bodyCount,sourceBodyCount:n.sourceBodyCount,offset:(this._offsets.get(n.members[0]) ?? new THREE.Vector3()).toArray()})), errors};
  }
}
