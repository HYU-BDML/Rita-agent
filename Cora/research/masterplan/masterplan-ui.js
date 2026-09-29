const navButtons=Array.from(document.querySelectorAll('nav button'));
const panels=Array.from(document.querySelectorAll('.panel'));
function showPanel(id,updateHash=true){
 if(!panels.some(p=>p.id===id)) id='overview';
 panels.forEach(p=>p.classList.toggle('active',p.id===id));
 navButtons.forEach(b=>b.setAttribute('aria-selected',String(b.dataset.panel===id)));
 if(updateHash) history.replaceState(null,'','#'+id);
 window.scrollTo(0,0);
}
navButtons.forEach(b=>b.addEventListener('click',()=>showPanel(b.dataset.panel)));
const search=document.getElementById('search'), stage=document.getElementById('stage'), area=document.getElementById('area');
const cards=Array.from(document.querySelectorAll('.feature'));
function matchesFeature(text,cardStage,cardArea,q,stageFilter,areaFilter,cardId){const textMatch=/^P[0-9]{3}$/i.test(q)?cardId===q.toUpperCase():(!q||text.toLowerCase().includes(q.toLowerCase()));return textMatch&&(!stageFilter||cardStage===stageFilter)&&(!areaFilter||cardArea===areaFilter);}
function filterFeatures(){
 const q=search.value.trim();let n=0;
 cards.forEach(c=>{const ok=matchesFeature(c.textContent,c.dataset.stage,c.dataset.area,q,stage.value,area.value,c.dataset.id);c.classList.toggle('hidden',!ok);if(ok)n++;});
 document.getElementById('count').textContent=n+' / '+cards.length+'개 기능';
 return n;
}
[search,stage,area].forEach(e=>e.addEventListener('input',filterFeatures));
document.getElementById('reset').addEventListener('click',()=>{search.value='';stage.value='';area.value='';filterFeatures();});
document.getElementById('expand').addEventListener('click',()=>{cards.forEach(c=>{if(!c.classList.contains('hidden')) c.open=true;});});
function openAllForPrint(){search.value='';stage.value='';area.value='';filterFeatures();cards.forEach(c=>c.open=true);window.print();}
document.getElementById('print').addEventListener('click',openAllForPrint);
window.addEventListener('hashchange',()=>showPanel(location.hash.slice(1),false));
filterFeatures();showPanel(location.hash.slice(1)||'overview',false);
