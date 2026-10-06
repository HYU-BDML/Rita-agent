import type{CoraStore}from'../store';
import{METRICS,METRIC_LABEL,SMALL_SAMPLE,aggregateSummary,normalizedMetrics,rowsOf,type MetricStat}from'../analytics';
import{OpsError}from'./errors';

type Block={h:string}|{p:string}|{table:{head:string[];rows:string[][]}}|{ul:string[]}|{quote:string};
export const pct=(x:number|null|undefined)=>x==null?'계산 안 됨':`${(x*100).toFixed(2)}%`;
const pp=(x:number|null)=>x==null?'계산 안 됨':`${x>=0?'+':''}${(x*100).toFixed(2)}%p`;
const statRow=(m:string,st:MetricStat)=>st.available?[m,String(st.n),String(st.missing),st.inconsistent?String(st.inconsistent):'0',pct(st.median),pct(st.weighted),st.smallSample?`표본 ${SMALL_SAMPLE}개 미만`:'']:[m,'-','-','-','열 없음','열 없음','CSV에 해당 열이 없음'];
type Agg=ReturnType<typeof aggregateSummary>;
/** Aggregate-only blocks, shared by the report and (as text) the AI prompt. No post titles or dates of single posts. */
export function aggregateBlocks(a:Agg):Block[]{
 const n=a.normalized,out:Block[]=[];
 out.push({h:'표본과 결측'},{table:{head:['항목','게시물 수'],rows:[['입력 행',String(n.sample.inputRows)],['중복으로 제외',String(n.sample.duplicateRows)],['중복 제외 후 게시물',String(n.sample.uniqueRows)],['도달이 빈칸이거나 0이라 비율에서 제외',String(n.sample.reachMissingOrZero)],['비율을 계산한 게시물',String(n.sample.reachEligibleRows)]]}});
 out.push({h:'노출 대비 반응 비율'},{p:'게시물마다 반응 수를 도달로 나눈 비율입니다. 중앙값은 게시물별 비율의 가운데 값, 가중 비율은 반응 합계를 도달 합계로 나눈 값입니다.'},{table:{head:['지표','표본 수','빈칸 제외','도달보다 커서 제외','중앙값','가중 비율','비고'],rows:METRICS.map(m=>statRow(METRIC_LABEL[m],n.metrics[m]))}});
 if(a.followers.available)out.push({h:'팔로워 추이'},{table:{head:['항목','값'],rows:[['측정 날짜 수',String(a.followers.pointCount)],['처음',a.followers.first?`${a.followers.first.date} · ${a.followers.first.followers.toLocaleString('en-US')}명`:'-'],['마지막',a.followers.last?`${a.followers.last.date} · ${a.followers.last.followers.toLocaleString('en-US')}명`:'-'],['변화',a.followers.change==null?'계산 안 됨':`${a.followers.change>=0?'+':''}${a.followers.change.toLocaleString('en-US')}명${a.followers.changePct==null?'':` (${(a.followers.changePct*100).toFixed(1)}%)`}`],['빈칸으로 제외한 행',String(a.followers.missingRows)]]}},{ul:a.followers.notes});
 else out.push({h:'팔로워 추이'},{p:a.followers.reason??'계산하지 않았습니다.'});
 if(a.comparison){const c=a.comparison;out.push({h:'기간 비교'},{table:{head:['항목',`A ${c.a.range.from}~${c.a.range.to}`,`B ${c.b.range.from}~${c.b.range.to}`,'B-A'],rows:[['게시물 수',String(c.a.posts),String(c.b.posts),String(c.b.posts-c.a.posts)],['도달 빈칸',String(c.a.reachMissing),String(c.b.reachMissing),''],['도달 중앙값',c.a.reachMedian==null?'없음':String(c.a.reachMedian),c.b.reachMedian==null?'없음':String(c.b.reachMedian),c.a.reachMedian==null||c.b.reachMedian==null?'':String(c.b.reachMedian-c.a.reachMedian)],
  ...METRICS.filter(m=>c.a.metrics[m].available).flatMap(m=>[[`${METRIC_LABEL[m]} 중앙값 (표본 A ${c.a.metrics[m].n} / B ${c.b.metrics[m].n})`,pct(c.a.metrics[m].median),pct(c.b.metrics[m].median),pp(c.differences[m].medianDiff)],[`${METRIC_LABEL[m]} 가중 비율`,pct(c.a.metrics[m].weighted),pct(c.b.metrics[m].weighted),pp(c.differences[m].weightedDiff)]])]}},{ul:c.warnings});}
 return out;
}
export const LIMITS=['이 자료는 사용자가 직접 올린 CSV이며 공식 Instagram 동기화 결과가 아닙니다.','비율과 기간 차이는 관찰한 숫자를 그대로 나눈 것이고, 검정(p값)이나 인과효과를 뜻하지 않습니다.',`표본이 ${SMALL_SAMPLE}개 미만이면 중앙값이 게시물 한두 개에 좌우됩니다.`,'빈칸은 결측으로 세어 제외했고 0으로 바꾸지 않았습니다.','같은 계정·형식·기간·광고 여부인지 확인한 뒤 해석하세요.'];
export const INSIGHT_DISCLAIMER='AI 해석, 인과 아님: 아래 답변은 집계표만 근거로 한 AI의 해석이며 원인을 입증하지 않습니다.';

export function reportBlocks(s:CoraStore,userId:string,analysisId:string,periods?:{a?:unknown;b?:unknown},clientId?:string|null){
 const item=clientId===undefined?s.item(userId,analysisId):s.scopedItem(userId,analysisId,clientId);if(!item||item.kind!=='analysis')throw new OpsError('진단 자료를 찾을 수 없습니다.',404);
 const rows=rowsOf(item.data),agg=aggregateSummary(item.data,periods),norm=normalizedMetrics(rows);
 const insights=(clientId===undefined?s.items(userId):s.scopedItems(userId,clientId)).filter(i=>i.kind==='material'&&i.data.format==='insight'&&i.data.analysisId===analysisId).slice(0,5);
 const blocks:Block[]=[{p:`기준 자료: ${String(item.data.summary??'')}`},{p:`분석 저장 시각: ${item.createdAt}`},...aggregateBlocks(agg)];
 blocks.push({h:'게시물별 노출 대비 비율'},{table:{head:['날짜','제목','도달','좋아요율','저장률','공유율','댓글률'],rows:norm.perPost.slice(0,50).map(p=>[p.date,p.title,String(p.reach),pct(p.likeRate),pct(p.saveRate),pct(p.shareRate),pct(p.commentRate)])}});
 if(norm.perPost.length>50)blocks.push({p:`게시물이 ${norm.perPost.length}개라 위 표에는 처음 50개만 실었습니다.`});
 if(insights.length){blocks.push({h:'저장된 AI 해석'},{p:INSIGHT_DISCLAIMER});for(const i of insights)blocks.push({p:`질문: ${String(i.data.question??'')}`},{quote:String(i.data.text??'')});}
 blocks.push({h:'한계'},{ul:[...LIMITS,...(Array.isArray(item.data.warnings)?(item.data.warnings as unknown[]).map(String).slice(0,30):[])]});
 if(clientId)blocks.unshift({p:`고객사 ID: ${clientId}`});
 return{title:clientId?`${s.clients.get(userId,clientId)?.name??'고객사'} · 계정 분석 리포트`:'계정 분석 리포트',blocks,analysisId,createdAt:item.createdAt};
}
const mdCell=(t:string)=>mdText(t).replace(/\|/g,'\\|');
const mdText=(t:string)=>String(t).replace(/\r?\n/g,' ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_[\]])/g,'\\$1');
export function renderMarkdown(r:{title:string;blocks:Block[]}){
 const o=[`# ${r.title}`,''];
 for(const b of r.blocks){
  if('h' in b)o.push(`## ${mdText(b.h)}`,'');
  else if('p' in b)o.push(mdText(b.p),'');
  else if('quote' in b)o.push(...b.quote.split(/\r?\n/).map(l=>`> ${mdText(l)}`),'');
  else if('ul' in b)o.push(...b.ul.map(x=>`- ${mdText(x)}`),'');
  else{o.push(`| ${b.table.head.map(mdCell).join(' | ')} |`,`| ${b.table.head.map(()=>'---').join(' | ')} |`,...b.table.rows.map(row=>`| ${row.map(mdCell).join(' | ')} |`),'');}
 }
 return o.join('\n');
}
export const escapeHtml=(t:string)=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function renderHtml(r:{title:string;blocks:Block[]}){
 const e=escapeHtml,body=r.blocks.map(b=>'h' in b?`<h2>${e(b.h)}</h2>`:'p' in b?`<p>${e(b.p)}</p>`:'quote' in b?`<blockquote>${e(b.quote).replace(/\r?\n/g,'<br>')}</blockquote>`:'ul' in b?`<ul>${b.ul.map(x=>`<li>${e(x)}</li>`).join('')}</ul>`:`<table><thead><tr>${b.table.head.map(h=>`<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${b.table.rows.map(row=>`<tr>${row.map(c=>`<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('\n');
 return`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(r.title)}</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:920px;margin:2rem auto;padding:0 1rem;color:#1a1a1a}table{border-collapse:collapse;width:100%;margin:.5rem 0 1.5rem;font-size:13px}th,td{border:1px solid #ccc;padding:.35rem .5rem;text-align:left;vertical-align:top}th{background:#f4f4f4}blockquote{margin:.5rem 0 1rem;padding:.5rem 1rem;border-left:4px solid #bbb;background:#fafafa}</style></head><body><h1>${e(r.title)}</h1>\n${body}\n</body></html>`;
}
