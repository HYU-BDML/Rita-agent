export function parseCSV(text:string):string[][]{
 const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}else field+=c;}
 if(quoted)throw new Error('CSV 따옴표가 닫히지 않았습니다.');row.push(field);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function analyzeCSV(text:string){
 const data=parseCSV(text.replace(/^\uFEFF/,''));if(data.length<2||data.length>501)throw new Error('헤더와 게시물 1~500행이 필요합니다.');
 const headers=data.shift()!.map(x=>x.trim().toLowerCase());const required=['date','title','reach','saves','likes','comments'];for(const key of required)if(!headers.includes(key))throw new Error(`필수 열: ${required.join(', ')}`);
 const val=(row:string[],key:string)=>row[headers.indexOf(key)]?.trim()??'';const warnings:string[]=[];
 const rows=data.map((r,i)=>{const date=val(r,'date');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error(`${i+2}행 날짜 형식 오류`);
  const num=(key:string)=>{const raw=val(r,key);if(raw==='')return null;const n=Number(raw);if(!Number.isFinite(n)||n<0||!Number.isInteger(n))throw new Error(`${i+2}행 ${key}: 0 이상의 정수 또는 빈칸`);return n;};
  const reach=num('reach'),saves=num('saves'),likes=num('likes'),comments=num('comments');if(reach===null||reach===0)warnings.push(`${i+2}행: 도달이 없거나 0이라 비율 미계산`);
  return{date,title:val(r,'title').slice(0,200),reach,saves,likes,comments,saveRate:reach&&saves!==null?saves/reach:null};
 });
 const valid=rows.filter(r=>r.saveRate!==null);const totalReach=valid.reduce((s,r)=>s+r.reach!,0);const totalSaves=valid.reduce((s,r)=>s+r.saves!,0);
 return{rows,warnings:[...warnings,'사용자가 제공한 수동 자료입니다. 공식 Instagram 동기화가 아닙니다.','같은 계정·형식·기간·광고 여부인지 확인하세요. 관찰 차이는 인과효과가 아닙니다.'],summary:`${rows.length}개 게시물 중 ${valid.length}개에서 저장률을 계산했습니다. ${totalReach?`비교 가능 행의 도달 가중 저장률은 ${(100*totalSaves/totalReach).toFixed(2)}%입니다.`:'비교 가능한 도달 데이터가 없습니다.'}`,recommendations:valid.length>=3?['저장률이 높은 게시물의 주제·형식을 직접 비교하고 다음 콘텐츠 한 건의 가설로 사용하세요.','같은 형식과 광고 집행 조건에서 비교한 뒤 결과를 기록하세요.']:['비교 가능한 게시물이 적습니다. 점수화하지 않고 자료부터 보완하세요.'],source:'manual-csv'};
}
