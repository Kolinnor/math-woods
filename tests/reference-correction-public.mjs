// Read-only verification of the audited pages against the post-correction snapshot.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parse } from '@retorquere/bibtex-parser';

const state=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
const pages=[...state.concept.map(p=>({...p,type:'concept',route:'concepts'})),...state.problem.map(p=>({...p,type:'problem',route:'problems'}))];
const results=[];
let index=0;
async function check(page) {
  const expected=state[page.type==='concept'?'conceptLibraryReference':'problemLibraryReference']
    .filter(c=>(c.conceptId??c.problemId)===page.id && !c.spoiler).sort((a,b)=>a.position-b.position);
  const href=`https://mathwoods.org/${page.route}/${encodeURIComponent(page.slug)}/export`;
  const response=await fetch(`${href}?format=json`,{signal:AbortSignal.timeout(25000)});
  assert.equal(response.status,200,`${href} JSON status ${response.status}`);
  const data=await response.json();
  assert.equal(data.references.length,expected.length,href);
  for(const [i,c] of expected.entries()) {
    const actual=data.references[i];
    assert.deepEqual({key:actual.key,text:actual.text,url:actual.url,locator:actual.locator,note:actual.note,role:actual.role},
      {key:c.citationKey,text:c.text,url:c.url,locator:c.locator,note:c.note,role:c.role},href);
    if(c.referenceId===null)assert.equal(actual.bibliography,null);
    else {
      const r=state.libraryReference.find(r=>r.id===c.referenceId);
      assert.equal(actual.bibliography.title,r.canonicalTitle);
      assert.equal(actual.bibliography.type,r.referenceType);
      assert.equal(actual.bibliography.authors,r.authors);
      assert.equal(actual.bibliography.isbn,r.isbn);
    }
  }
  const bib=await fetch(`${href}?format=bibtex`,{signal:AbortSignal.timeout(25000)});
  assert.equal(bib.status,200,`${href} BibTeX status ${bib.status}`);
  const parsed=parse(await bib.text(),{unsupported:'ignore'});
  assert.equal(parsed.errors.length,0,href); assert.equal(parsed.entries.length,expected.length,href);
  if(page.type==='concept') {
    // Pin the audited language: the normal page may otherwise redirect to another translation.
    const rendered=await fetch(`https://mathwoods.org/concepts/${encodeURIComponent(page.slug)}?viewLanguage=${page.language}`,
      {headers:{cookie:`math-woods-language=${page.language}`},signal:AbortSignal.timeout(25000)});
    assert.equal(rendered.status,200);
    const html=await rendered.text();
    const section=html.match(/<section class="problem-citations-reading"[\s\S]*?<\/section>/)?.[0];
    assert.ok(section,`Missing rendered references on ${page.slug}`);
    assert.equal((section.match(/<li>/g)??[]).length,expected.length,`Rendered count on ${page.slug}`);
    assert.ok(!/@book\{|publisher\s*=|author\s*=|978-2868836977/.test(section),`Raw fragments on ${page.slug}`);
  }
  return {type:page.type,id:page.id,slug:page.slug,references:expected.length,ok:true};
}
await Promise.all(Array.from({length:4},async()=>{
  while(index<pages.length) {
    const page=pages[index++];
    try { results.push(await check(page)); }
    catch(error){results.push({type:page.type,id:page.id,slug:page.slug,ok:false,error:error.message});}
    if(results.length%20===0)console.log(`${results.length}/${pages.length} pages checked`);
  }
}));
const health=await fetch('https://mathwoods.org/api/health',{signal:AbortSignal.timeout(25000)});
assert.equal(health.status,200); assert.equal((await health.json()).ok,true);
const failures=results.filter(r=>!r.ok);
fs.writeFileSync('runtime/reference-correction-public-checks-20260906.json',JSON.stringify({results,health:true},null,2));
console.log(JSON.stringify({pages:results.length,passed:results.length-failures.length,failures,health:true}));
if(failures.length)process.exitCode=1;
