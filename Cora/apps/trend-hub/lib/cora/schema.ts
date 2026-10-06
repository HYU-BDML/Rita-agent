import type {DatabaseSync} from 'node:sqlite';
/** DDL and its marker commit together; a killed process leaves neither a partial step nor a false success. */
export function schemaStep(db:DatabaseSync,id:string,apply:()=>void){
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec('CREATE TABLE IF NOT EXISTS cora_schema_steps(id TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
  // Reconcile additive legacy schemas, even if a prior release had no version markers.
  apply();db.prepare('INSERT OR IGNORE INTO cora_schema_steps VALUES(?,?)').run(id,new Date().toISOString());db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
