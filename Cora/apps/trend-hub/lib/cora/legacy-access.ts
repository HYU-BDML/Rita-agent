/** Legacy data is one shared operator store, never a customer workspace. */
export function isCoraPublicPath(path:string){
 return path==='/'||path==='/studio'||path.startsWith('/studio/')||path==='/api/cora'||path.startsWith('/api/cora/')||path.startsWith('/_next/static/')||path==='/_next/image'||path==='/favicon.ico'
  // Public surfaces: static help/API docs, public link-in-bio pages, and the API-key-authenticated REST API.
  ||path==='/help'||path==='/api-docs'||/^\/l\/[a-z0-9-]{3,30}(\/click)?$/.test(path)||path.startsWith('/api/v1/');
}
export function legacyAccess(operatorId:string|undefined,userId:string|undefined,method:string,originAllowed:boolean){
 if(!operatorId)return {status:503,error:'원본 트렌드 작업실은 운영자 설정 후 사용할 수 있습니다. 소재 검색은 Cora 작업실에서 이용해 주세요.'};
 if(!userId)return {status:401,error:'Cora 로그인이 필요합니다.'};
 if(userId!==operatorId)return {status:403,error:'공유 원본 자료는 지정한 운영자만 사용할 수 있습니다.'};
 if(!['GET','HEAD','OPTIONS'].includes(method)&&!originAllowed)return{status:403,error:'허용되지 않은 요청입니다.'};
 return null;
}
