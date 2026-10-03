import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instagramReadiness } from '../lib/cora/instagram-readiness';
const env = { CORA_IG_APP_ID:'dummy-id', CORA_IG_APP_SECRET:'hidden-secret', CORA_SECRET_KEY:'hidden-key', CORA_ORIGIN:'https://cora.example', CORA_IG_REDIRECT_URI:'https://cora.example/api/cora/connect/instagram/callback' };
test('Instagram readiness reports configuration without secrets or claiming live verification',()=>{
 const r=instagramReadiness(env);assert.equal(r.localConfigReady,true);assert.equal(r.accountAuthorizationVerified,false);assert.equal(r.livePublishingEnabled,false);assert.equal(r.mediaConfigured,false);
 for(const v of ['hidden-secret','hidden-key','dummy-id','https://cora.example'])assert.ok(!JSON.stringify(r).includes(v));
 assert.equal(instagramReadiness({}).localConfigReady,false);
});
test('Instagram readiness catches callback and session-origin mistakes',()=>{
 for(const uri of ['http://cora.example/api/cora/connect/instagram/callback','https://cora.example/wrong','https://u:p@cora.example/api/cora/connect/instagram/callback','https://cora.example/api/cora/connect/instagram/callback?token=secret'])assert.equal(instagramReadiness({...env,CORA_IG_REDIRECT_URI:uri}).localConfigReady,false);
 const r=instagramReadiness({...env,CORA_ORIGIN:'http://127.0.0.1:3210'});assert.equal(r.checks.find(c=>c.id==='callback')!.ready,true);assert.equal(r.checks.find(c=>c.id==='origin')!.ready,false);
});
