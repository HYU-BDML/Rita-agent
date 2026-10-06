import type{NextRequest}from'next/server';
import{store}from'@/lib/cora/store';import{json}from'@/lib/cora/http';import{opsGet,opsPost}from'@/lib/cora/ops/http';import{RECIPE_TEMPLATES,saveRecipeTemplate}from'@/lib/cora/ops/recipes';
export const runtime='nodejs';export const dynamic='force-dynamic';
export function GET(req:NextRequest){return opsGet(req,()=>json({templates:RECIPE_TEMPLATES}));}
/** POST {templateId, title?, frequency?, prompt?, brand?} saves the template as the user's automation recipe. */
export function POST(req:NextRequest){return opsPost(req,(u,b)=>{const r=saveRecipeTemplate(store(),u.id,b as {templateId:unknown});return json(r,r.created?201:200);});}
