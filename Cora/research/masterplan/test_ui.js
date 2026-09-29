const fs=require('fs'),vm=require('vm'),assert=require('assert');
const fixtures=JSON.parse(fs.readFileSync('work/masterplan/ui-fixtures.json','utf8'));
class Element{
 constructor(id='',data={},text=''){this.id=id;this.dataset=data;this.textContent=text;this.value='';this.open=false;this.attrs={};this.listeners={};this.classes=new Set();this.classList={toggle:(k,on)=>{if(on===undefined)on=!this.classes.has(k);if(on)this.classes.add(k);else this.classes.delete(k);return on;},add:k=>this.classes.add(k),contains:k=>this.classes.has(k)};}
 addEventListener(type,fn){this.listeners[type]=fn;}
 setAttribute(k,v){this.attrs[k]=v;}
}
const panels=fixtures.panels.map(x=>new Element(x));
const nav=fixtures.nav.map(x=>new Element('',{panel:x}));
const cards=fixtures.cards.map(x=>new Element('',{id:x.id,stage:x.stage,area:x.area},x.text));
const elements=Object.fromEntries(['search','stage','area','count','reset','expand','print'].map(k=>[k,new Element(k)]));
let printed=0;
const context={document:{querySelectorAll:q=>({'nav button':nav,'.panel':panels,'.feature':cards}[q]),getElementById:id=>elements[id]},history:{replaceState:()=>{}},location:{hash:''},window:{scrollTo:()=>{},addEventListener:()=>{},print:()=>printed++}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('work/masterplan/masterplan-ui.js','utf8'),context);
let checks=0;
function test(name,fn){fn();checks++;process.stdout.write('PASS '+name+'\n');}
test('initial overview and 110 visible features',()=>{assert(panels[0].classes.has('active'));assert.strictEqual(elements.count.textContent,'110 / 110개 기능');});
test('all twelve navigation buttons',()=>{nav.forEach((b,i)=>{b.listeners.click();assert(panels[i].classes.has('active'));assert.strictEqual(panels.filter(p=>p.classes.has('active')).length,1);assert.strictEqual(b.attrs['aria-selected'],'true');});});
test('invalid panel falls back to overview',()=>{context.showPanel('missing');assert(panels[0].classes.has('active'));});
test('feature ID exact match',()=>{elements.search.value='P046';assert.strictEqual(context.filterFeatures(),1);assert(!cards.find(c=>c.dataset.id==='P046').classes.has('hidden'));});
test('case insensitive feature search',()=>{elements.search.value='p046';assert.strictEqual(context.filterFeatures(),1);});
test('no results is explicit',()=>{elements.search.value='__no_matching_feature__';assert.strictEqual(context.filterFeatures(),0);assert.strictEqual(elements.count.textContent,'0 / 110개 기능');});
test('combined stage and area filter',()=>{elements.search.value='';elements.stage.value='Scale';elements.area.value='댓글·DM';assert.strictEqual(context.filterFeatures(),5);});
test('expand only visible results',()=>{elements.expand.listeners.click();assert.strictEqual(cards.filter(c=>c.open).length,5);});
test('reset restores all results',()=>{elements.reset.listeners.click();assert.strictEqual(context.filterFeatures(),110);});
test('print resets filters and expands all',()=>{elements.search.value='P001';context.filterFeatures();elements.print.listeners.click();assert.strictEqual(printed,1);assert.strictEqual(cards.filter(c=>c.open&&!c.classes.has('hidden')).length,110);});
fs.writeFileSync('work/masterplan/ui-test-result.json',JSON.stringify({checks,passed:checks,scope:'Node VM DOM stubs; browser visual rendering not tested'},null,2));
