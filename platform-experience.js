import {LayeredExplorer} from '/layered-explorer.js?v=purchase-1';
import {mountExplorationShell} from '/exploration-shell.js?v=purchase-1';
import {qualifiedOffers,replacementAction} from '/shop/commerce.js?v=purchase-1';
import {sourceIdentifier} from '/part-identity.js?v=purchase-1';

// The session owns display scopes and poses. The source adapters own part identity.
export function createPlatformExperience(adapter){
 const {root,meshes=[],camera,controls,bodyOf,unitOf,majorOf,nativeUnits,surface,toolbar,title,parts=[],showPart,clearPart,fit,sync}=adapter;
 let mode=root?'showcase':'reference',session=null,shell=null;
 const motion=matchMedia('(prefers-reduced-motion: reduce)');
 const orbit=()=>{if(controls){controls.autoRotate=adapter.presentationMotion!==false&&mode==='showcase'&&!motion.matches&&!document.hidden;controls.autoRotateSpeed=.55;adapter.invalidate?.()}};
 const visibleChildren=()=>session?.children().filter(n=>n.members.some(m=>!session.isReference(m)))??[];
 const refresh=()=>{if(!shell)return;const children=visibleChildren(),selected=session?.selected;let notice=root?(adapter.geometryKind==='reconstructed-study'?'Reference reconstruction · confirm installed part':'Source geometry · confirm replacement fit'):'3D model unavailable · published references';if(mode==='cad'&&session){notice=selected?(adapter.depthNote?.(selected)??'Single CAD body · deeper subparts are not supplied'):`${session.scope.bodyCount} CAD bodies · open groups to inspect components`;if(adapter.geometryKind==='reconstructed-study'&&selected)notice+=' · replacement identity unverified';}shell.update({mode,breadcrumbs:(session?.breadcrumbs()??[]).filter(n=>n!==session.tree),children,exploded:session?.exploded??false,isolated:session?.isolated??false,canIsolate:!!selected,canExplode:!!session&&children.length>1&&!session.scope.atomic,selected:selected?.id,notice});adapter.invalidate?.()};
 const clear=()=>{clearPart?.();refresh()};
 const setMode=next=>{
  if(!root)return;next=next==='cad'?'cad':'showcase';if(next===mode)return;
  adapter.cancelMotion?.();controls.autoRotate=false;clearPart?.();session.home();mode=next;orbit();refresh();
 };
 const openPart=part=>{if(root)setMode('cad');const matches=adapter.resolvePartMeshes?.(part)??[],owners=[...new Set(matches.map(m=>session?.ownerOf(m)).filter(Boolean))];if(owners.length===1){session.enter(owners[0].parent.id);session.enter(owners[0].id);}else{session?.home();}showPart?.(part);refresh()};
 const catalog=parts.filter(p=>p.status!=='visual-component-unidentified'&&p.status!=='unmatched-cad-body'&&p.catalogKind!=='semantic-assembly');
 shell=mountExplorationShell({surface,toolbar,title,hasModel:!!root,onMode:setMode,onHome:()=>session?.home(),onBack:id=>id==null?session?.back():session?.enter(id),onReset:()=>session?.reset(),onExplode:()=>session?.setExploded(!session.exploded),onIsolate:()=>session?.setIsolated(!session.isolated),onEnter:id=>session?.enter(id),onCatalog:openPart});
 shell.setCatalog(catalog.map(p=>{const offer=qualifiedOffers(p)[0];return {...p,manufacturerPartNumber:p.manufacturerPartNumber??offer?.manufacturerPartNumber,sku:offer?.sku??p.sku,displayIdentifier:sourceIdentifier(p,offer),orderable:replacementAction(p).ready}}),openPart);
 if(root){
  session=new LayeredExplorer({root,meshes,bodyOf,unitOf,majorOf,nativeUnits,title:'Machine',isReference:adapter.isReference??(()=>false),onPart:mesh=>{adapter.selectMesh(mesh);refresh()},onClear:clear,fit,renderSync:()=>{sync?.(session);refresh()},onChange:refresh});
  session.home();
 }
 const api={session,shell,setMode,refresh,openPart,get mode(){return mode},visible:mesh=>!session||session.visible(mesh),nodeForHit(mesh){let n=session?.ownerOf(mesh);if(!n||!session.visible(mesh))return null;while(n.parent&&n.parent!==session.scope)n=n.parent;return n.parent===session.scope||n===session.scope?n:null},choose(mesh){if(!session)return;if(mode!=='cad')setMode('cad');session.choose(mesh);refresh()},clearSelection(){session?.clearSelection();refresh()},diagnostics:()=>({mode,motion:controls?.autoRotate??false,catalogRecords:catalog.length,...session?.diagnostics()})};
 motion.addEventListener('change',orbit);document.addEventListener('visibilitychange',orbit);
 const inspector=surface.querySelector('.part-inspector,.inspector');if(inspector)new MutationObserver(refresh).observe(inspector,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 orbit();refresh();window.platformExplorer=api;return api;
}
