import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {body,json,sameOrigin,user} from '@/lib/cora/http';
import {validateDraft} from '@/lib/cora/model';
import {LibraryStore,BUILTIN_TEMPLATES,applyTemplate} from '@/lib/cora/library';
export const runtime='nodejs';export const dynamic='force-dynamic';
const lib=()=>store().module('library',db=>new LibraryStore(db));
const err=(e:unknown)=>{const m=e instanceof Error?e.message:'라이브러리 작업 실패';return m==='NOT_FOUND'?json({error:'항목을 찾을 수 없습니다.'},404):m==='CONFLICT'?json({error:'다른 화면에서 먼저 수정했습니다. 새로 불러온 뒤 다시 수정해 주세요.'},409):json({error:m},400);};
function view(id:string,brand?:string){const l=lib();return{templates:l.templates(id),logos:l.logos(id),ctas:l.ctas(id,brand),builtins:BUILTIN_TEMPLATES};}
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);const b=req.nextUrl.searchParams.get('brand');return json(view(u.id,b===null?undefined:b));}
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
  try{const b=await body(req),l=lib(),id=typeof b.id==='string'?b.id.slice(0,80):'',a=b.action;
    if(a==='save-template'){
      if(typeof b.builtin==='string')l.saveFromBuiltin(u.id,b.builtin,b.name);
      else{if(typeof b.projectId!=='string')throw new Error('템플릿으로 저장할 작업이나 기본 디자인을 골라 주세요.');const p=store().get(u.id,b.projectId.slice(0,80));if(!p)throw new Error('NOT_FOUND');l.saveFromDraft(u.id,p,String(b.name??''),{headline:b.headline,body:b.body});}
      return json(view(u.id),201);}
    if(a==='update-template'){l.update(u.id,id,Number(b.version),{name:b.name,design:b.design,styles:b.styles,headline:b.headline,body:b.body,slideCount:b.slideCount});return json(view(u.id));}
    if(a==='favorite'){l.setFavorite(u.id,id,b.favorite!==false);return json(view(u.id));}
    if(a==='delete-template'){if(!l.deleteTemplate(u.id,id))throw new Error('NOT_FOUND');return json(view(u.id));}
    if(a==='apply-template'){const t=l.template(u.id,typeof b.templateId==='string'?b.templateId.slice(0,80):'');if(!t)throw new Error('NOT_FOUND');return json({draft:validateDraft(applyTemplate(validateDraft(b.draft),t))});}
    if(a==='add-logo'){l.addLogo(u.id,b.name,b.data,b.brand);return json(view(u.id),201);}
    if(a==='delete-logo'){if(!l.deleteLogo(u.id,id))throw new Error('NOT_FOUND');return json(view(u.id));}
    if(a==='set-default-logo'){l.setDefaultLogo(u.id,id);return json(view(u.id));}
    if(a==='add-cta'){l.addCta(u.id,b.text,b.brand);return json(view(u.id),201);}
    if(a==='use-cta'){const c=l.useCta(u.id,id);return json({...view(u.id),used:c});}
    if(a==='delete-cta'){if(!l.deleteCta(u.id,id))throw new Error('NOT_FOUND');return json(view(u.id));}
    throw new Error('지원하지 않는 라이브러리 작업입니다.');
  }catch(e){return err(e);}
}
