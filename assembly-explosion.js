import * as THREE from 'three';

// Presentation only. Source geometry, body identities and original transforms are immutable.
// Layout units are distinct from source assembly containers; move leaves exactly once.
export class AssemblyExplosion {
  constructor(root, meshes, groupOf, bodyOf, isReference = () => false, options = {}) {
    this.root=root;this.meshes=meshes;this.bodyOf=bodyOf;this.isReference=isReference;
    this.enabled=false;this.spacing=2;this.pulled=false;this.selection=new Set();this.defaultBreakdown='assemblies';this.breakdown=this.defaultBreakdown;this.scope=null;
    root.updateMatrixWorld(true);
    const bodyKeys=new Map();
    this.records=meshes.map(mesh=>{
      mesh.geometry.computeBoundingBox();const body=bodyOf(mesh),assembly=groupOf(mesh);
      if(!bodyKeys.has(body))bodyKeys.set(body,`body:${bodyKeys.size}`);
      return {mesh,body,bodyKey:bodyKeys.get(body),assembly,defaultGroup:options.defaultGroupOf?.(mesh)??assembly,componentGroup:options.componentGroupOf?.(mesh)??bodyKeys.get(body),group:assembly,position:mesh.position.clone(),matrix:mesh.matrixWorld.clone(),parentInverse:mesh.parent.matrixWorld.clone().invert(),bounds:mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),offset:new THREE.Vector3()};
    });
    this.sourceBounds=new THREE.Box3();this.assemblyGroups=new Map();
    for(const r of this.records){if(isReference(r.mesh))continue;this.sourceBounds.union(r.bounds);const a=this.assemblyGroups.get(r.assembly)??{id:r.assembly,bounds:new THREE.Box3(),records:[]};a.bounds.union(r.bounds);a.records.push(r);this.assemblyGroups.set(r.assembly,a)}
    this.extent=Math.max(...this.sourceBounds.getSize(new THREE.Vector3()).toArray(),.000001);this.regroup();
  }
  regroup(){
    this.groups=new Map();this.layoutBounds=new THREE.Box3();
    for(const r of this.records){
      r.group=!this.scope||this.breakdown==='assemblies'?r.assembly:r.componentGroup;
      if(this.isReference(r.mesh)||(this.scope&&r.assembly!==this.scope))continue;
      const g=this.groups.get(r.group)??{id:r.group,bounds:new THREE.Box3(),records:[],offset:new THREE.Vector3()};g.bounds.union(r.bounds);g.records.push(r);this.groups.set(r.group,g);this.layoutBounds.union(r.bounds);
    }
    this.layoutExtent=Math.max(...this.layoutBounds.getSize(new THREE.Vector3()).toArray(),.000001);this.plan();
  }
  setScope(scope){const next=this.assemblyGroups.has(scope)?scope:null;if(next===this.scope)return;this.scope=next;this.breakdown=next?(this.breakdown==='source-shapes'?'source-shapes':'components'):'assemblies';this.regroup();this.apply()}
  setBreakdown(mode){this.breakdown=this.scope&&['components','source-shapes'].includes(mode)?mode:'assemblies';this.regroup();this.apply()}
  plan(){
    const groups=[...this.groups.values()],center=this.layoutBounds.getCenter(new THREE.Vector3());
    // Every mode preserves source-relative placement. Overlaps are intentional:
    // the picker and one-part pullout provide access without dismantling the machine.
    // Source-shape mode changes picking granularity, not physical display groups.
    this.layoutType=!this.scope||this.breakdown==='assemblies'?'overview':'assembly-detail';
    const size=this.layoutBounds.getSize(new THREE.Vector3());
    let anchor=groups[0],volume=-1;
    for(const group of groups){const s=group.bounds.getSize(new THREE.Vector3()),v=s.x*s.y*s.z;if(v>volume){volume=v;anchor=group}}
    const origin=anchor?.bounds.getCenter(new THREE.Vector3())??center;
    for(const group of groups){group.offset.copy(group.bounds.getCenter(new THREE.Vector3()).sub(origin)).multiplyScalar(.12*this.spacing);for(const axis of ['x','y','z']){const cap=size[axis]*.025*this.spacing;group.offset[axis]=THREE.MathUtils.clamp(group.offset[axis],-cap,cap)}}
  }
  setSelection(meshes){this.selection=new Set(meshes.map(this.bodyOf));if(!this.selection.size)this.pulled=false;this.apply()}
  setEnabled(enabled){this.enabled=enabled;this.apply()}
  setSpacing(spacing){this.spacing=spacing;this.plan();this.apply()}
  setPulled(pulled){this.pulled=pulled&&this.selection.size>0;this.apply()}
  apply(){
    const full=new THREE.Box3(),selected=new THREE.Box3();
    for(const r of this.records){r.offset.set(0,0,0);if(this.enabled&&!this.isReference(r.mesh)&&(!this.scope||r.assembly===this.scope))r.offset.copy(this.groups.get(r.group)?.offset??r.offset);const bounds=r.bounds.clone().translate(r.offset);if(!this.isReference(r.mesh))full.union(bounds);if(this.selection.has(r.body))selected.union(bounds)}
    const pull=new THREE.Vector3();if(this.pulled&&!selected.isEmpty())pull.x=full.max.x-selected.min.x+this.layoutExtent*.15*this.spacing;
    for(const r of this.records){if(this.selection.has(r.body))r.offset.add(pull);const local=r.offset.clone().applyMatrix4(r.parentInverse).sub(new THREE.Vector3().applyMatrix4(r.parentInverse));r.mesh.position.copy(r.position).add(local)}
    this.root.updateMatrixWorld(true);
  }
  reset(){this.enabled=false;this.pulled=false;this.spacing=2;this.selection.clear();this.breakdown=this.defaultBreakdown;this.scope=null;this.regroup();this.apply()}
  bounds(meshes=this.meshes.filter(m=>!this.isReference(m))){const box=new THREE.Box3();for(const mesh of meshes)box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));return box}
  originBounds(meshes){const members=new Set(meshes),box=new THREE.Box3();for(const r of this.records){if(!members.has(r.mesh))continue;const offset=this.enabled&&!this.isReference(r.mesh)&&(!this.scope||r.assembly===this.scope)?this.groups.get(r.group)?.offset:new THREE.Vector3();box.union(r.bounds.clone().translate(offset??new THREE.Vector3()))}return box}
  diagnostics(){
    const groupOffsets=new Map(),bodyOffsets=new Map(),assemblyOffsets=new Map();let groupsRigid=true,bodiesRigid=true,restored=true;
    for(const r of this.records){const actual=new THREE.Vector3().setFromMatrixPosition(r.mesh.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(r.matrix));if(actual.length()>1e-7)restored=false;const prev=bodyOffsets.get(r.body);if(prev&&actual.distanceTo(prev)>1e-6)bodiesRigid=false;bodyOffsets.set(r.body,actual);if(this.isReference(r.mesh))continue;const offsets=assemblyOffsets.get(r.assembly)??new Map();offsets.set(r.body,actual);assemblyOffsets.set(r.assembly,offsets);if(this.selection.has(r.body)&&this.pulled)continue;const p=groupOffsets.get(r.group);if(p&&actual.distanceTo(p)>1e-6)groupsRigid=false;groupOffsets.set(r.group,actual)}
    const gs=[...this.groups.values()],bounds=gs.map(g=>g.bounds.clone().translate(this.enabled?g.offset:new THREE.Vector3()));let overlaps=0;for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++)if(bounds[i].intersectsBox(bounds[j]))overlaps++;
    const assemblies=[...assemblyOffsets].map(([id,offsets])=>({id,bodies:offsets.size,distinctOffsets:new Set([...offsets.values()].map(v=>v.toArray().map(x=>x.toFixed(6)).join(','))).size,movedBodies:[...offsets.values()].filter(v=>v.length()>1e-7).length}));
    return {layoutType:this.layoutType,overviewAxisCap:.025*this.spacing,sourceExtent:this.layoutBounds.getSize(new THREE.Vector3()).toArray(),enabled:this.enabled,spacing:this.spacing,pulled:this.pulled,breakdown:this.breakdown,scope:this.scope,groupCount:gs.length,groups:gs.map(g=>({id:g.id,primitives:g.records.length,offset:g.offset.toArray()})),assemblies,groupsRigid,bodiesRigid,sourcePoseRestored:restored,assemblyOverlaps:overlaps,extent:this.extent,layoutExtent:this.layoutExtent,expandedExtent:this.bounds(this.records.filter(r=>!this.isReference(r.mesh)&&(!this.scope||r.assembly===this.scope)).map(r=>r.mesh)).getSize(new THREE.Vector3()).toArray(),selectedBodies:this.selection.size};
  }
}

export function explosionControls(container,onSpacing,onPull,groups=[],onGroup=()=>{},onBreakdown=()=>{},options={}){
  const panel=document.createElement('div');panel.className='explosion-controls';panel.hidden=true;
  const label=document.createElement('label');label.htmlFor='explode-spacing';label.textContent='Separation';const slider=document.createElement('input');slider.id='explode-spacing';slider.type='range';slider.min='1';slider.max='4';slider.step='.25';slider.value='2';const value=document.createElement('output');value.htmlFor=slider.id;value.textContent='2×';label.append(slider,value);slider.oninput=()=>{value.textContent=slider.value+'×';onSpacing(Number(slider.value))};
  const modeLabel=document.createElement('label');modeLabel.textContent='View';const breakdown=document.createElement('select');breakdown.id='explode-breakdown';breakdown.setAttribute('aria-label','Explosion breakdown');for(const [id,name] of (options.breakdownModes??[['assemblies','Machine overview'],['components','Assembly separation'],['source-shapes','Individual part selection']])){const o=document.createElement('option');o.value=id;o.textContent=name;breakdown.append(o)}breakdown.onchange=()=>onBreakdown(breakdown.value);modeLabel.append(breakdown);
  const groupLabel=document.createElement('label');groupLabel.textContent='Explore assembly';const group=document.createElement('select');group.id='explode-assembly';group.setAttribute('aria-label','Explore an exploded assembly');for(const id of ['',...groups]){const o=document.createElement('option');o.value=id;o.textContent=id||'All assemblies';group.append(o)}group.onchange=()=>onGroup(group.value);groupLabel.append(group);
  const pull=document.createElement('button');pull.id='pull-selection';pull.textContent='Separate selected part';pull.setAttribute('aria-pressed','false');pull.disabled=true;pull.onclick=onPull;
  const hint=document.createElement('span');hint.className='explosion-note';hint.textContent=options.hint??'Choose an assembly to open a small gap while keeping the machine visible. Select and separate one part for a closer look.';
  panel.append(label,modeLabel,groupLabel,pull,hint);container.after(panel);return {panel,slider,pull,value,group,breakdown};
}

// A source-position marker and leader keep a pulled component tied to its location.
export class SelectionLocationCue {
  constructor(scene,explosion){
    this.explosion=explosion;this.group=new THREE.Group();this.group.name='Selection source location';this.group.visible=false;
    this.origin=new THREE.Box3Helper(new THREE.Box3(),0xb0d8a1);this.origin.material.transparent=true;this.origin.material.opacity=.55;this.origin.material.depthTest=false;this.origin.renderOrder=12;
    this.line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineDashedMaterial({color:0xb0d8a1,transparent:true,opacity:.75,depthTest:false,dashSize:1,gapSize:.5}));this.line.renderOrder=12;
    this.group.add(this.origin,this.line);scene.add(this.group);this.state={active:false};
  }
  update(meshes,visible){
    this.group.visible=!!(visible&&this.explosion.pulled&&meshes.length);this.state={active:this.group.visible};if(!this.group.visible)return;
    const from=this.explosion.originBounds(meshes),to=this.explosion.bounds(meshes),a=from.getCenter(new THREE.Vector3()),b=to.getCenter(new THREE.Vector3());this.origin.box.copy(from);this.line.geometry.attributes.position.setXYZ(0,...a.toArray());this.line.geometry.attributes.position.setXYZ(1,...b.toArray());this.line.geometry.attributes.position.needsUpdate=true;this.line.geometry.computeBoundingSphere();this.line.material.dashSize=this.explosion.extent*.015;this.line.material.gapSize=this.explosion.extent*.008;this.line.computeLineDistances();this.state={active:true,originMin:from.min.toArray(),originMax:from.max.toArray(),originCenter:a.toArray(),componentCenter:b.toArray()};
  }
  diagnostics(){return this.state}
}
