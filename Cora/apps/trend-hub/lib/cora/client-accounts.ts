import {schemaStep} from './schema';
import {randomUUID} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {CoraStore} from './store';
import type {InstagramConnections} from './instagram-connect';
export type BindingVersion={accountId:string;version:number};
export type ClientAccountBinding=BindingVersion & {clientId:string;igUserId:string;username:string;active:boolean;expiresAt:string;access:string;createdAt:string;updatedAt:string};
type Row={id:string;client_id:string;ig_user_id:string;version:number;created:string;updated:string};
export function validateBindingVersion(value:unknown):BindingVersion|null {
  if(value===null)return null;
  const v=value as BindingVersion;
  if(!v||typeof v.accountId!=='string'||!/^[\da-f-]{36}$/i.test(v.accountId)||!Number.isSafeInteger(v.version)||v.version<1)throw new Error('연결 ID와 현재 버전을 확인해 주세요.');
  return {accountId:v.accountId,version:v.version};
}
/** One explicit Instagram binding per client; no token access and no automatic matching by name. */
export class ClientAccounts {
  constructor(private db:DatabaseSync,private store:CoraStore,private ig:InstagramConnections) {
    schemaStep(db,'client-instagram-v1',()=>{
    db.exec(`CREATE TABLE IF NOT EXISTS client_instagram_bindings(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,ig_user_id TEXT NOT NULL,version INTEGER NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(user_id,client_id),UNIQUE(user_id,ig_user_id),FOREIGN KEY(user_id,ig_user_id) REFERENCES ig_accounts(user_id,ig_user_id) ON DELETE CASCADE);`);
    });
  }
  private row(ownerId:string,clientId:string){return this.db.prepare('SELECT * FROM client_instagram_bindings WHERE user_id=? AND client_id=?').get(ownerId,clientId) as Row|undefined;}
  private binding(ownerId:string,row?:Row):ClientAccountBinding|null {
    if(!row)return null;const account=this.ig.accounts(ownerId).find(a=>a.igUserId===row.ig_user_id);if(!account)return null;
    return {accountId:row.id,version:Number(row.version),clientId:row.client_id,igUserId:row.ig_user_id,username:account.username,active:account.active,expiresAt:account.expiresAt,access:account.access,createdAt:row.created,updatedAt:row.updated};
  }
  view(userId:string,clientId:string) {
    const client=this.store.accessibleClient(userId,clientId);if(!client)throw new Error('NOT_FOUND');
    const owner=this.store.clients.owner(clientId)!,binding=this.binding(owner,this.row(owner,clientId));
    // Shared editors see this client's metadata only, never another client's choices or any token.
    const accounts=client.access==='owner'?this.ig.accounts(userId).map(a=>({...a,boundClientId:(this.db.prepare('SELECT client_id FROM client_instagram_bindings WHERE user_id=? AND ig_user_id=?').get(userId,a.igUserId) as {client_id:string}|undefined)?.client_id??null})):[];
    return {clientId,access:client.access,binding,accounts};
  }
  private atomic<T>(fn:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  private matches(row:Row|undefined,expected:BindingVersion|null) {
    if(row?(!expected||expected.accountId!==row.id||expected.version!==Number(row.version)):expected!==null)throw new Error('CONFLICT');
  }
  bind(userId:string,clientId:string,igUserId:string,expected:BindingVersion|null) {
    expected=validateBindingVersion(expected);
    return this.atomic(()=>{
      if(!this.store.clients.get(userId,clientId))throw new Error('NOT_FOUND');
      if(typeof igUserId!=='string'||!/^[0-9]{1,40}$/.test(igUserId))throw new Error('Instagram 계정 ID를 확인해 주세요.');
      const account=this.ig.accounts(userId).find(a=>a.igUserId===igUserId);
      if(!account)throw new Error('NOT_FOUND');if(!account.active)throw new Error('만료된 계정입니다. Instagram 연결을 다시 승인해 주세요.');
      const prior=this.row(userId,clientId);this.matches(prior,expected);
      const other=this.db.prepare('SELECT client_id FROM client_instagram_bindings WHERE user_id=? AND ig_user_id=?').get(userId,igUserId) as {client_id:string}|undefined;
      if(other&&other.client_id!==clientId)throw new Error('이 Instagram 계정은 다른 고객사에 연결되어 있습니다. 먼저 연결 지정을 해제해 주세요.');
      const now=new Date().toISOString();
      if(prior)this.db.prepare('UPDATE client_instagram_bindings SET ig_user_id=?,version=version+1,updated=? WHERE id=?').run(igUserId,now,prior.id);
      else this.db.prepare('INSERT INTO client_instagram_bindings VALUES (?,?,?,?,?,?,?)').run(randomUUID(),userId,clientId,igUserId,1,now,now);
      return this.binding(userId,this.row(userId,clientId))!;
    });
  }
  unbind(userId:string,clientId:string,expected:BindingVersion) {
    const valid=validateBindingVersion(expected);if(!valid)throw new Error('연결 ID와 현재 버전이 필요합니다.');
    return this.atomic(()=>{if(!this.store.clients.get(userId,clientId))throw new Error('NOT_FOUND');this.matches(this.row(userId,clientId),valid);this.db.prepare('DELETE FROM client_instagram_bindings WHERE user_id=? AND client_id=?').run(userId,clientId);return true;});
  }
}
