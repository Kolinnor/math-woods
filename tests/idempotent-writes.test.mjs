import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as achievementCopy from '../lib/achievement-copy.ts';
import * as trustedPolicy from '../lib/trusted-user-policy.ts';
const require = createRequire(import.meta.url);
const client = require('@prisma/client');
function load(file, modules) {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{exports,Date,require:name=>{
    if (name in modules) return modules[name];
    if(name==='@prisma/client')return client;
    if(name==='next/cache')return {revalidatePath(){}};
    throw new Error(`Unexpected dependency: ${name}`);
  }});
  return exports;
}
// Enforce the database uniqueness contract and the Prisma bulk-write option:
// a duplicate is an error unless the caller explicitly asks PostgreSQL to skip it.
function table(key) {
  const rows=new Map();let id=0;
  return {rows,async createManyAndReturn({data,skipDuplicates}) {
    assert.equal(skipDuplicates,true);
    const k=key(data);if(rows.has(k))return [];
    const row={id:++id,...data};rows.set(k,row);return [row];
  }};
}
test('repeated and simultaneous achievement checks send only one notification per unlocked badge',async()=>{
  const unlocks=table(x=>`${x.userId}:${x.key}`),notifications=[];
  const prisma={achievementUnlock:unlocks,problemAttempt:{findMany:async()=>Array.from({length:10},(_,i)=>({problem:{translationGroupId:String(i)}}))},user:{findUnique:async()=>({profileSlug:'test'})}};
  const actions=load('../lib/achievements.ts',{'@/lib/db':{prisma},'@/lib/achievement-copy':achievementCopy,'@/lib/notifications':{createNotification:async x=>notifications.push(x)},'@/lib/usernames':{profilePath:()=>'/profile/test'}});
  await Promise.all(Array.from({length:8},()=>actions.checkSolveAchievements(4)));
  assert.equal(unlocks.rows.size,2);assert.equal(notifications.length,2);
  await actions.checkSolveAchievements(4);assert.equal(notifications.length,2);
  prisma.achievementUnlock={createManyAndReturn:async()=>{throw Error('database unavailable')}};
  await assert.rejects(actions.checkSolveAchievements(4),/database unavailable/);
});
test('trusted-user suggestions remain unique and notify the owner once',async()=>{
  const suggestions=table(x=>x.userId),notifications=[];
  suggestions.update=async()=>{};
  const tx={user:{findFirst:async()=>({id:4,username:'candidate'})},trustedUserRecommendation:suggestions,notification:{create:async({data})=>{notifications.push(data);return {id:1}}}};
  const prisma={user:{findFirst:async()=>({id:1})},$transaction:async callback=>callback(tx)};
  const actions=load('../lib/trusted-user-recommendations.ts',{'@/lib/db':{prisma},'@/lib/trusted-user-policy':trustedPolicy,'@/lib/user-reputation':{getReputationLeaderboard:async()=>[]},'@/lib/user-display':{displayNameForUser:()=> 'Candidate'}});
  const results=await Promise.all(Array.from({length:8},()=>actions.maybeCreateTrustedUserRecommendation(4,trustedPolicy.TRUSTED_USER_REPUTATION_THRESHOLD)));
  assert.equal(results.filter(Boolean).length,1);assert.equal(suggestions.rows.size,1);assert.equal(notifications.length,1);
  tx.user.findFirst=async()=>null;
  assert.equal(await actions.maybeCreateTrustedUserRecommendation(5,trustedPolicy.TRUSTED_USER_REPUTATION_THRESHOLD),false);
  assert.equal(notifications.length,1);
});
test('repeated problem opens respect the twelve-hour window and share exposure across translations',async()=>{
  const exposures=table(x=>`${x.userId}:${x.translationGroupId}`);let solved=false;
  const model={
    createMany:async({data,...options})=>({count:(await exposures.createManyAndReturn({data:{exposureCount:1,...data},...options})).length}),
    updateMany:async({where,data})=>{
      const row=exposures.rows.get(`${where.userId}:${where.translationGroupId}`);
      if(!row||row.lastOpenedAt>where.lastOpenedAt.lte)return {count:0};
      row.lastOpenedAt=data.lastOpenedAt;row.problemId=data.problemId;row.exposureCount++;return {count:1};
    },
    deleteMany:async()=>exposures.rows.clear()
  };
  const prisma={problemRecommendationExposure:model,problem:{findUnique:async({where})=>({id:where.id,authorId:1,translationGroupId:'shared'})},problemAttempt:{findFirst:async()=>solved?{id:1}:null}};
  const route=load('../app/api/problems/[problemId]/recommendation-exposure/route.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},'@/lib/db':{prisma},'@/lib/auth':{getCurrentUser:async()=>({id:4})},'@/lib/rate-limit':{assertRateLimit:async()=>{}},'@/lib/recommendation-events':{recordRecommendationEvent:async()=>{}}});
  const open=id=>route.POST(null,{params:Promise.resolve({problemId:String(id)})});
  await Promise.all(Array.from({length:8},(_,i)=>open(i%2+10)));
  assert.equal(exposures.rows.size,1);const row=exposures.rows.values().next().value;
  assert.equal(row.exposureCount,1);
  row.lastOpenedAt=new Date(Date.now()-13*60*60*1000);
  await Promise.all(Array.from({length:8},()=>open(11)));
  assert.equal(row.exposureCount,2);assert.equal(row.problemId,11);
  solved=true;await open(11);assert.equal(exposures.rows.size,0);
  solved=false;model.createMany=async()=>{throw Error('database unavailable')};
  await assert.rejects(open(11),/database unavailable/);
});
