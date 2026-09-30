/** Error with an HTTP status so routes can answer precisely without leaking internals. */
export class OpsError extends Error{constructor(message:string,readonly status=400){super(message);}}
export function asOpsError(e:unknown):OpsError{
 if(e instanceof OpsError)return e;
 const m=e instanceof Error?e.message:'작업 실패';
 if(m==='NOT_FOUND')return new OpsError('대상을 찾을 수 없습니다.',404);
 if(m==='CONFLICT')return new OpsError('다른 창에서 먼저 바뀌었습니다. 새로고침 후 다시 시도해 주세요.',409);
 const status=(e as {status?:number}).status;
 return new OpsError(m,typeof status==='number'?status:400);
}
