import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { filterMathematicians, parseMathematicianFilters, mathematicianPeriod, legacyMathematicianPeriod, submittedMathematicianPeriod, mathematiciansHref, mathematiciansReturnHref } from '../lib/mathematician-browser.ts';
const year=2026;
const translation=(language,name,extra={})=>({language,displayName:name,sortName:'',teaser:'',biographyHtml:'<p>Biography</p>',contributionsHtml:'',...extra});
const person=(id,name,lifespan,translations,extra={})=>({id,name,aliases:[],lifespan,status:'PUBLISHED',needsReviewAfterEdit:false,createdAt:new Date(2020,0,id),updatedAt:new Date(2021,0,id),translations,...extra});
const people=[
  person(1,'Emmy Noether','1882–1935',[translation('fr','Emmy Noether'),translation('en','Emmy Noether')]),
  person(2,'Euclid','vers 300 avant J.-C.',[translation('fr','Euclide'),translation('en','Euclid')],{needsReviewAfterEdit:true}),
  person(3,'Leonhard Euler','1707–1783',[translation('en','Leonhard Euler')]),
  person(4,'Carl Friedrich Gauss','1777–1855',[translation('fr','Carl Friedrich Gauss')]),
  person(5,'Unknown','inconnues',[translation('fr','Personne inconnue',{biographyHtml:'<p>&nbsp;</p>'})]),
  person(6,'Jean Dupont','1960–',[translation('fr','Jean Dupont')],{status:'PENDING_REVIEW'})
];
const results=query=>filterMathematicians(people,parseMathematicianFilters(query,'fr',year),'fr',year);

test('language defaults are strict, empty selection means no results and translations never duplicate a person',()=>{
  assert.deepEqual(parseMathematicianFilters({},'fr',year).languages,['fr']);
  assert.deepEqual(parseMathematicianFilters({},'en',year).languages,['en']);
  assert.equal(results({}).some(row=>row.person.id===3),false);
  assert.equal(results({languagesSet:'1'}).length,0);
  assert.equal(results({language:'xx'}).length,0);
  const rows=results({language:['fr','en','fr']});
  assert.equal(rows.length,6); assert.equal(rows.find(row=>row.person.id===1).translation.language,'fr');
  assert.equal(results({language:'en'}).find(row=>row.person.id===1).translation.language,'en');
});
test('life overlap includes someone born before the interval and dates unknown are excluded only with a period',()=>{
  assert.deepEqual(results({from:'1800',to:'1820'}).map(row=>row.person.id),[4]);
  assert.equal(results({}).some(row=>row.person.id===5),true);
  assert.equal(results({era:'modern'}).some(row=>row.person.id===5),false);
  assert.deepEqual(results({era:'ancient'}).map(row=>row.person.id),[2]);
  assert.deepEqual(results({from:'2020',to:'2026'}).map(row=>row.person.id),[6]);
});
test('date interpretation is conservative, supports BCE, living and explicit intervals without inventing missing years',()=>{
  for(const raw of ['287–212 BC','287-212 av. J.-C.','-287–-212'])assert.deepEqual(legacyMathematicianPeriod(raw,year),{from:-287,to:-212});
  assert.deepEqual(legacyMathematicianPeriod('vers 300 avant J.-C.',year),{from:-300,to:-300});
  assert.deepEqual(legacyMathematicianPeriod('1960–',year),{from:1960,to:year});
  assert.deepEqual(legacyMathematicianPeriod('né en 1777',year),{from:1777,to:1777});
  assert.equal(legacyMathematicianPeriod('IIIe siècle av. J.-C.',year),null);
  assert.equal(legacyMathematicianPeriod('1900 ou 1910',year),null);
  assert.deepEqual(mathematicianPeriod({lifespan:'unknown',periodStartYear:-325,periodEndYear:-265},year),{from:-325,to:-265});
  assert.deepEqual(mathematicianPeriod({lifespan:'1900–2000',periodStartYear:1950},year),{from:1950,to:1950});
});
test('alphabetical uses a sort name, chronological places unknown dates last, entry dates are separate',()=>{
  assert.deepEqual(results({}).map(row=>row.person.id),[6,2,4,5,1]);
  assert.deepEqual(results({sort:'oldest'}).map(row=>row.person.id),[2,4,1,6,5]);
  assert.deepEqual(results({sort:'recent'}).map(row=>row.person.id),[6,1,4,2,5]);
  assert.deepEqual(results({sort:'added'}).map(row=>row.person.id),[6,5,4,2,1]);
  const rows=filterMathematicians([{...people[0],translations:[translation('fr','Emmy Noether',{sortName:'A'})]},people[1]],parseMathematicianFilters({},'fr',year),'fr',year);
  assert.equal(rows[0].person.id,1);
});
test('review includes pending and edited published entries; contribution selections are a union',()=>{
  assert.deepEqual(results({review:'1'}).map(row=>row.person.id),[6,2]);
  assert.deepEqual(results({stub:'1'}).map(row=>row.person.id),[5]);
  assert.deepEqual(results({review:'1',stub:'1'}).map(row=>row.person.id),[6,2,5]);
});
test('existing name, alias and introduction search is preserved without searching biographies',()=>{
  assert.equal(results({q:'NOETHER'}).length,1);
  assert.equal(results({q:'Biography'}).length,0);
});
test('URLs retain repeated language filters and empty selections and reject external return links',()=>{
  const href=mathematiciansHref({languagesSet:'1',language:['fr','en'],from:'-500',to:'1500',sort:'oldest',review:'1',page:'2'});
  assert.deepEqual(new URL(href,'https://mathwoods.org').searchParams.getAll('language'),['fr','en']);
  assert.equal(mathematiciansReturnHref(href),href);
  for(const unsafe of ['//example.com','https://example.com','javascript:alert(1)','/library/mathematicians/other'])assert.equal(mathematiciansReturnHref(unsafe),'/library/mathematicians');
  assert.equal(mathematiciansHref({languagesSet:'1',language:[]}),'/library/mathematicians?languagesSet=1');
});
test('date form validation preserves old forms, rejects impossible bounds and allows empty drafts',()=>{
  assert.deepEqual(submittedMathematicianPeriod(new FormData(),'fr',year),{});
  const form=new FormData();form.set('periodStartYear','');form.set('periodEndYear','');
  assert.deepEqual(submittedMathematicianPeriod(form,'fr',year),{periodStartYear:null,periodEndYear:null});
  form.set('periodStartYear','0');assert.throws(()=>submittedMathematicianPeriod(form,'fr',year),/zéro/);
  form.set('periodStartYear','1900');form.set('periodEndYear','1800');assert.throws(()=>submittedMathematicianPeriod(form,'fr',year),/précéder/);
});
test('PostgreSQL migration preserves legacy dates and constrains structured periods',{skip:!process.env.MW_PGLITE_MODULE},async()=>{
  const {PGlite}=await import(pathToFileURL(process.env.MW_PGLITE_MODULE).href);const db=new PGlite();
  try {
    await db.exec('CREATE TABLE "Mathematician" (id INT PRIMARY KEY, lifespan TEXT); CREATE TABLE "MathematicianTranslation" (id INT PRIMARY KEY); INSERT INTO "Mathematician" VALUES (1,\'vers 300 avant J.-C.\'); INSERT INTO "MathematicianTranslation" VALUES (1);');
    await db.exec(readFileSync(new URL('../prisma/migrations/20260907200000_mathematician_browser/migration.sql',import.meta.url),'utf8'));
    assert.equal((await db.query('SELECT lifespan FROM "Mathematician"')).rows[0].lifespan,'vers 300 avant J.-C.');
    assert.equal((await db.query('SELECT "sortName" FROM "MathematicianTranslation"')).rows[0].sortName,'');
    await assert.rejects(db.exec('UPDATE "Mathematician" SET "periodStartYear"=1900,"periodEndYear"=1800'));
  }finally{await db.close();}
});
