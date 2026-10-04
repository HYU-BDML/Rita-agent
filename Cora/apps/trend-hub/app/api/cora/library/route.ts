import {clientScope} from '@/lib/cora/client-scope';
import {NextRequest} from 'next/server';
import {store} from '@/lib/cora/store';
import {body,json,sameOrigin,user} from '@/lib/cora/http';
import {validateDraft} from '@/lib/cora/model';
import {LibraryStore,BUILTIN_TEMPLATES,applyTemplate} from '@/lib/cora/library';
export const runtime='nodejs';export const dynamic='force-dynamic';
const lib=()=>store().module('library',db=>new LibraryStore(db));
const err=(e:unknown)=>{const m=e instanceof Error?e.message:'라이브러리 작업 실패';return m==='NOT_FOUND'?json({error:'항목을 찾을 수 없습니다.'},404):m==='CONFLICT'?json({error:'다른 화면에서 먼저 수정했습니다. 새로 불러온 뒤 다시 수정해 주세요.'},409):json({error:m},400);};
function view(l:LibraryStore,id:string,brand?:string,personal=false){return{...(personal?{personal:{templates:l.forClient(null).templates(id),logos:l.forClient(null).logos(id),ctas:l.forClient(null).ctas(id)}}:{}),clientId:l.clientId,templates:l.templates(id),logos:l.logos(id),ctas:l.ctas(id,brand),builtins:BUILTIN_TEMPLATES};}
export function GET(req:NextRequest){const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);try{const clientId=clientScope(req.nextUrl.searchParams.get('clientId')),l=lib().forClient(clientId),b=req.nextUrl.searchParams.get('brand');return store().withClientAccess(u.id,clientId,owner=>json(view(l,owner,b===null?undefined:b,!!clientId&&owner===u.id)));}catch(e){return err(e);}}
export async function POST(req:NextRequest){
  if(!sameOrigin(req))return json({error:'허용되지 않은 요청입니다.'},403);const u=user(req);if(!u)return json({error:'로그인이 필요합니다.'},401);
  try{const b=await body(req),clientId=clientScope(b.clientId),l=lib().forClient(clientId);return store().withClientAccess(u.id,clientId,owner=>{const id=typeof b.id==='string'?b.id.slice(0,80):'',a=b.action;
    if(a==='copy-personal'){if(!clientId||owner!==u.id)throw new Error('NOT_FOUND');l.copyPersonal(owner,b.kind,id,b.version);return json(view(l,owner,undefined,true),201);}
    if(a==='save-template'){
      if(typeof b.builtin==='string')l.saveFromBuiltin(owner,b.builtin,b.name);
      else{if(typeof b.projectId!=='string')throw new Error('템플릿으로 저장할 작업이나 기본 디자인을 골라 주세요.');const p=store().get(owner,b.projectId.slice(0,80));if(!p||clientScope(p.clientId)!==clientId)throw new Error('NOT_FOUND');l.saveFromDraft(owner,p,String(b.name??''),{headline:b.headline,body:b.body});}
      return json(view(l,owner,undefined,!!clientId&&owner===u.id),201);}
    if(a==='update-template'){l.update(owner,id,Number(b.version),{name:b.name,design:b.design,styles:b.styles,headline:b.headline,body:b.body,slideCount:b.slideCount});return json(view(l,owner,undefined,!!clientId&&owner===u.id));}
    if(a==='favorite'){l.setFavorite(owner,id,b.favorite!==false);return json(view(l,owner,undefined,!!clientId&&owner===u.id));}
    if(a==='delete-template'){if(!l.deleteTemplate(owner,id))throw new Error('NOT_FOUND');return json(view(l,owner,undefined,!!clientId&&owner===u.id));}
    if(a==='apply-template'){const t=l.template(owner,typeof b.templateId==='string'?b.templateId.slice(0,80):'');if(!t)throw new Error('NOT_FOUND');const draft=validateDraft(b.draft);if(clientScope(draft.clientId)!==clientId)throw new Error('NOT_FOUND');return json({draft:validateDraft(applyTemplate(draft,t))});}
    if(a==='add-logo'){l.addLogo(owner,b.name,b.data,b.brand);return json(view(l,owner,undefined,!!clientId&&owner===u.id),201);}
    if(a==='delete-logo'){if(!l.deleteLogo(owner,id))throw new Error('NOT_FOUND');return json(view(l,owner,undefined,!!clientId&&owner===u.id));}
    if(a==='set-default-logo'){l.setDefaultLogo(owner,id);return json(view(l,owner,undefined,!!clientId&&owner===u.id));}
    if(a==='add-cta'){l.addCta(owner,b.text,b.brand);return json(view(l,owner,undefined,!!clientId&&owner===u.id),201);}
    if(a==='use-cta'){const c=l.useCta(owner,id);return json({...view(l,owner,undefined,!!clientId&&owner===u.id),used:c});}
    if(a==='delete-cta'){if(!l.deleteCta(owner,id))throw new Error('NOT_FOUND');return json(view(l,owner,undefined,!!clientId&&owner===u.id));}
    throw new Error('지원하지 않는 라이브러리 작업입니다.');});
  }catch(e){return err(e);}
}
