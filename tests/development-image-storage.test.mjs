import test from 'node:test';
import assert from 'node:assert/strict';
import {unlink} from 'node:fs/promises';
import path from 'node:path';
import {developmentImageStorageEnabled,readDevelopmentImage,writeDevelopmentImage} from '../lib/development-image-storage.ts';

test('development images round-trip locally, reject paths and are inaccessible in production',async()=>{
  const previous=process.env.NODE_ENV;
  let filename;
  try {
    process.env.NODE_ENV='development';
    assert.equal(developmentImageStorageEnabled('http://localhost:3000/api/images/upload'),true);
    assert.equal(developmentImageStorageEnabled('http://127.0.0.1:3000/api/images/upload'),true);
    assert.equal(developmentImageStorageEnabled('https://mathwoods.org/api/images/upload'),false);
    const image=await writeDevelopmentImage(Buffer.from('validated image bytes'),'image/png');filename=image.key;
    assert.ok(image.publicUrl.startsWith('/api/images/local/'));
    const stored=await readDevelopmentImage(filename);
    assert.equal(stored.contentType,'image/png');assert.equal(stored.body.toString(),'validated image bytes');
    for(const invalid of ['../../.env.local','../'+filename,filename+'.html','arbitrary.png']) assert.equal(await readDevelopmentImage(invalid),null);
    await assert.rejects(writeDevelopmentImage(Buffer.from('svg'),'image/svg+xml'),/Unsupported/);
    process.env.NODE_ENV='production';
    assert.equal(developmentImageStorageEnabled('http://localhost:3000/api/images/upload'),false);
    assert.equal(await readDevelopmentImage(filename),null);
    await assert.rejects(writeDevelopmentImage(Buffer.from('image'),'image/png'),/development-only/);
  } finally {
    if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous;
    if(filename)await unlink(path.join(process.cwd(),'runtime','development-images',filename));
  }
});
