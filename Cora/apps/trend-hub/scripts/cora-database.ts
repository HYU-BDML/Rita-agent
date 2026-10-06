#!/usr/bin/env node
import {backupDatabase,restoreDatabase} from '../lib/cora/database-backup';
// No environment/default database lookup: the operator must supply both absolute paths.
const [action,source,target,...extra]=process.argv.slice(2);
if(!source||!target||extra.length||!['backup','restore'].includes(action)){
 process.stderr.write('Usage: npm run cora:database -- backup /absolute/source.sqlite /absolute/new-backup-dir\n       npm run cora:database -- restore /absolute/backup-dir /absolute/new-restore-dir\nDatabase only: media files and the separately managed encryption key are not included.\n');process.exitCode=1;
}else{try{process.stdout.write(JSON.stringify(action==='backup'?backupDatabase(source,target):restoreDatabase(source,target),null,2)+'\n');}catch(e){process.stderr.write((e instanceof Error?e.message:'Database operation failed.')+'\n');process.exitCode=1;}}
