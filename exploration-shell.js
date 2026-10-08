// Presentation only: geometry, assembly identity, and qualified commerce stay in the viewer.
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(className)n.className=className;return n};
const button=(label,id,callback)=>{const b=el('button',label);b.type='button';if(id)b.id=id;if(callback)b.addEventListener('click',callback);return b};
const labelOf=p=>String(p?.label??p?.name??p?.title??p?.id??'Assembly');
const numberOf=p=>String(p?.partNumber??p?.manufacturerPartNumber??'');
const skuOf=p=>String(p?.sku??'');

/**
 * A model-first v7 exploration shell. update accepts mode ('showcase'|'cad'),
 * breadcrumbs/children [{id,label}], exploded, isolated, canIsolate, canExplode,
 * selected, and notice. setCatalog accepts documented records only; the caller
 * remains responsible for exact part identity and qualified ordering links.
 */
export function mountExplorationShell({surface,toolbar,title,hasModel=true,onMode,onHome,onBack,onReset,onExplode,onIsolate,onEnter,onCatalog}={}){
 if(!surface)throw new Error('Exploration shell requires a model surface');
 document.body.classList.add('v7-viewer');
 toolbar?.classList.add('v7-legacy-toolbar');
 const state={mode:'showcase',breadcrumbs:[],children:[],exploded:false,isolated:false,canIsolate:false,canExplode:false,selected:null,notice:''};
 const shell=el('div',null,'exploration-shell');
 const modebar=el('div',null,'exploration-modebar');
 const modes=el('div',null,'exploration-modes');modes.setAttribute('role','group');modes.setAttribute('aria-label','Exploration mode');
 const chooseMode=mode=>{if(!hasModel)return;state.mode=mode;render();onMode?.(mode)};
 const showcase=button('Showcase','mode-showcase',()=>chooseMode('showcase'));
 const cad=button('Explore parts','mode-cad',()=>chooseMode('cad'));
 showcase.disabled=cad.disabled=!hasModel;modes.append(showcase,cad);
 const find=button('Find a part','find-part',()=>openCatalog());find.setAttribute('aria-haspopup','dialog');
 modebar.append(modes,find);shell.append(modebar);
 const context=el('div',null,'exploration-context');
 const display=el('p',hasModel?'Drag to look around':'Reference view','exploration-display');
 const path=el('nav',null,'exploration-path');path.setAttribute('aria-label','Assembly path');
 const children=el('div',null,'exploration-children');children.setAttribute('role','group');children.setAttribute('aria-label','Next assembly layer');
 const notice=el('p',null,'exploration-notice');notice.setAttribute('role','status');
 context.append(display,path,children,notice);shell.append(context);surface.append(shell);
 const controls=el('div',null,'layer-toolbar');controls.setAttribute('role','group');controls.setAttribute('aria-label','Assembly controls');
 const explode=button('Explode','layer-explode',()=>onExplode?.());
 const isolate=button('Isolate','layer-isolate',()=>onIsolate?.());
 const reset=button('Reset','layer-reset',()=>onReset?.());controls.append(explode,isolate,reset);surface.append(controls);
 const home=button('Back to machine','layer-home',()=>onHome?.());home.className='layer-home';surface.append(home);

 const dialog=el('dialog',null,'exploration-part-dialog');dialog.setAttribute('aria-labelledby','part-search-title');
 const dialogHeader=el('div',null,'part-search-header');
 const heading=el('h2','Find a part');heading.id='part-search-title';
 const close=button('×','close-part-search',()=>dialog.close());close.setAttribute('aria-label','Close part search');dialogHeader.append(heading,close);
 const machine=el('p',String(title??'Equipment'),'part-search-machine');
 const searchLabel=el('label','Part name or number','part-search-label');searchLabel.htmlFor='part-search-input';
 const search=el('input');search.id='part-search-input';search.type='search';search.placeholder='Search documented parts';search.autocomplete='off';
 const count=el('p',null,'part-search-count');count.setAttribute('role','status');count.setAttribute('aria-live','polite');
 const list=el('div',null,'part-search-results');
 const license=el('a','License & notices','exploration-license');license.href='/license.html';
 const selectionContext=el('p',null,'part-search-context');selectionContext.hidden=true;
 dialog.append(dialogHeader,machine,selectionContext,searchLabel,search,count,list,license);surface.append(dialog);
 let parts=[],selectPart=onCatalog,lastFocus=null,lastHeight=-1,frame=0,destroyed=false;
 const renderCatalog=()=>{
  const query=search.value.trim().toLocaleLowerCase();
  const matches=parts.filter(p=>`${labelOf(p)} ${numberOf(p)} ${skuOf(p)}`.toLocaleLowerCase().includes(query));
  count.textContent=parts.length?`${matches.length} documented ${matches.length===1?'part':'parts'}`:'No documented parts available';
  const frag=document.createDocumentFragment();
  for(const part of matches){
   const row=button(null,null,()=>{dialog.close();if(hasModel&&state.mode!=='cad')chooseMode('cad');selectPart?.(part)});row.className='part-search-result';
   row.append(el('span',labelOf(part),'part-search-name'));
   const number=numberOf(part),sku=skuOf(part),identity=part.displayIdentifier;row.append(el('span',identity?`${identity.label}: ${identity.value}`:number?`Part number: ${number}`:sku?`Retailer SKU: ${sku}`:'Part number not verified','part-search-number'));
   // Status comes from the same qualified records used by the ordering card.
   if(part.orderable===true)row.append(el('span','Replacement eligibility confirmed','part-search-orderable'));
   frag.append(row);
  }
  if(parts.length&&!matches.length)frag.append(el('p','No matching documented parts.','part-search-empty'));
  list.replaceChildren(frag);
 };
 search.addEventListener('input',renderCatalog);
 const openCatalog=({query='',contextNote=''}={})=>{if(destroyed)return;lastFocus=document.activeElement;search.value=query;selectionContext.textContent=contextNote;selectionContext.hidden=!contextNote;renderCatalog();if(!dialog.open)dialog.showModal();search.focus()};
 dialog.addEventListener('close',()=>lastFocus?.focus?.());
 dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close()}});
 const resize=()=>{if(destroyed)return;const height=Math.ceil(shell.getBoundingClientRect().height);if(height===lastHeight)return;lastHeight=height;surface.style.setProperty('--explorer-shell-height',`${height}px`);cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')))};
 const observer=new ResizeObserver(resize);observer.observe(shell);
 const render=()=>{
  const isCAD=hasModel&&state.mode==='cad';surface.dataset.explorationMode=isCAD?'cad':hasModel?'showcase':'reference';
  showcase.setAttribute('aria-pressed',String(!isCAD));cad.setAttribute('aria-pressed',String(isCAD));
  display.hidden=isCAD;path.hidden=children.hidden=!isCAD;controls.hidden=!isCAD;home.hidden=!isCAD||!state.breadcrumbs.length;
  notice.textContent=String(state.notice??'');notice.hidden=!state.notice;
  path.replaceChildren();
  const machineButton=button('Machine',null,()=>onHome?.());machineButton.setAttribute('aria-label','Back to complete machine');path.append(machineButton);
  const crumbs=state.breadcrumbs.filter(Boolean);
  for(let i=0;i<crumbs.length;i++){const crumb=crumbs[i];const separator=el('span','/','path-separator');separator.setAttribute('aria-hidden','true');path.append(separator);const b=button(labelOf(crumb),null,()=>onBack?.(crumb.id,i));if(i===crumbs.length-1)b.setAttribute('aria-current','location');path.append(b)}
  children.replaceChildren();
  for(const child of state.children.filter(Boolean)){const b=button(labelOf(child)+(child.leaf?'':' ›'),null,()=>onEnter?.(child.id,child));b.className='assembly-chip';b.dataset.kind=child.kind??(child.leaf?'source-body':'group');b.setAttribute('aria-label',child.leaf?`Inspect ${labelOf(child)}: source CAD body`:`Open ${labelOf(child)}: ${child.bodyCount??child.sourceBodyCount??'?'} source CAD bodies`);if(state.selected===child.id||state.selected?.id===child.id)b.setAttribute('aria-pressed','true');children.append(b)}
  children.hidden=!isCAD||!state.children.length;
  explode.disabled=!hasModel||!state.canExplode;isolate.disabled=!hasModel||!state.canIsolate;reset.disabled=!hasModel;
  explode.setAttribute('aria-pressed',String(!!state.exploded));isolate.setAttribute('aria-pressed',String(!!state.isolated));
  explode.textContent=state.exploded?'Assemble':'Explode';isolate.textContent=state.isolated?'Show context':'Isolate';
  resize();
 };
 render();
 return{
  update(next={}){Object.assign(state,next);render()},
  setCatalog(records=[],onSelect=onCatalog){parts=Array.isArray(records)?records:[];selectPart=onSelect;renderCatalog()},
  openCatalog,
  destroy(){destroyed=true;observer.disconnect();cancelAnimationFrame(frame);if(dialog.open)dialog.close();shell.remove();controls.remove();home.remove();dialog.remove();toolbar?.classList.remove('v7-legacy-toolbar');surface.style.removeProperty('--explorer-shell-height');delete surface.dataset.explorationMode}
 };
}
