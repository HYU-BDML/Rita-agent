/** Explicit stable identity, never infer a client from a display name/handle or nested payload. */
export function clientScope(value:unknown):string|null {
  if(value===undefined||value===null||value==='')return null;
  if(typeof value!=='string'||value.length>80||!value.trim()||value!==value.trim())throw new Error('고객사 ID를 확인해 주세요.');
  return value;
}
