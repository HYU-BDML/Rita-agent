import type{CoraStore}from'../store';
import{RECIPE_FORMATS}from'../scheduler-handlers';
import{OpsError,asOpsError}from'./errors';

export type RecipeTemplate={id:string;title:string;frequency:string;prompt:string;format:keyof typeof RECIPE_FORMATS;description:string};
/** Pre-fill values for the existing recipe form (title, frequency, prompt) plus the generate format. No AI is called here. */
export const RECIPE_TEMPLATES:RecipeTemplate[]=[
 {id:'weekly-digest',title:'주간 소식 요약',frequency:'주 1회',format:'blog',description:'한 주 동안 붙여 넣은 소식·자료를 독자가 3분 안에 읽을 요약 글로 정리합니다.',prompt:'이번 주에 제공한 소식과 자료만 근거로 주간 소식 요약을 작성한다. 핵심 소식 3가지를 먼저 쓰고, 각 소식마다 무엇이 바뀌었는지와 독자에게 필요한 행동 한 가지를 덧붙인다. 자료에 없는 날짜·가격·수치는 쓰지 말고 확인할 사실로 따로 표시한다.'},
 {id:'series',title:'시리즈 연재',frequency:'주 1회',format:'script',description:'같은 주제를 여러 편으로 나눠 연재하고, 앞 편과 이어지는 첫 장면을 넣습니다.',prompt:'제공한 소재로 연재물의 다음 편을 작성한다. 지난 편을 한 문장으로 되짚는 첫 장면으로 시작하고, 이번 편의 핵심 한 가지만 다룬 뒤, 다음 편 예고로 끝낸다. 회차 번호와 회차 제목을 붙이고 자료 밖의 약속은 하지 않는다.'},
 {id:'performance-remix',title:'성과 기반 재가공',frequency:'월 1회',format:'ideas',description:'저장률이 높았던 게시물의 주제·형식을 바꿔 새 콘텐츠 소재로 다시 만듭니다.',prompt:'제공한 성과 요약(저장률·도달)에서 반응이 높았던 게시물의 주제와 형식을 확인하고, 같은 주제를 다른 형식으로 다시 만드는 소재 5개를 제안한다. 각 소재에 근거가 된 게시물 특징과 확인할 사실을 적고, 반응이 높았던 이유를 단정하지 않는다.'},
];
const str=(v:unknown,max:number,name:string,optional=false)=>{if(v==null&&optional)return undefined;if(typeof v!=='string'||v.length>max||(!optional&&!v.trim()))throw new OpsError(`${name} 길이를 확인해 주세요.`);return v.trim();};
/** Saves a template as the user's own automation recipe (kind 'automation'). The same template is not saved twice unchanged. */
export function saveRecipeTemplate(s:CoraStore,userId:string,input:{templateId:unknown;title?:unknown;frequency?:unknown;prompt?:unknown;brand?:unknown}){
 try{
  const t=RECIPE_TEMPLATES.find(x=>x.id===input.templateId);if(!t)throw new OpsError('예시 템플릿을 찾을 수 없습니다.',404);
  const title=str(input.title,200,'레시피 제목',true)||t.title,frequency=str(input.frequency,60,'운영 주기',true)||t.frequency,prompt=str(input.prompt,2000,'제작 지시',true)||t.prompt,brand=str(input.brand,100,'브랜드',true)??'';
  const prior=s.items(userId).find(i=>i.kind==='automation'&&i.data.templateId===t.id&&i.title===title&&i.data.prompt===prompt&&i.data.frequency===frequency&&(i.data.brand??'')===brand);
  if(prior)return{created:false,item:prior};
  return{created:true,item:s.addItem(userId,'automation',title,{prompt,frequency,brand,format:t.format,templateId:t.id})};
 }catch(e){throw asOpsError(e);}
}
