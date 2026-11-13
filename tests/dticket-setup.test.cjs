'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../dticket-setup.cjs');
test('validates schedule fields and rejects cron injection', () => {
  assert.equal(setup.validateSchedule('*/15 8-18 * * 1-5'), '*/15 8-18 * * 1-5');
  for (const bad of ['* * * * *;id', '60 * * * *', '*/0 * * * *', '*  * * * *']) assert.throws(() => setup.validateSchedule(bad));
});
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
test('creates private exclusive config outside git and previews only', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'dticket-')); fs.chmodSync(dir, 0o700);
  try {
    const file = path.join(dir, 'config.json');
    const preview = setup.createConfig(file, '0 8 * * *', ['--origin', 'Bonn'], 'https://discord.com/api/webhooks/123/secret', ['/usr/bin/node', '/app/cli.cjs']);
    assert.match(preview, /^0 8 \* \* \* /); assert.doesNotMatch(preview, /secret/);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.deepEqual(setup.loadConfig(file).arguments, ['--origin', 'Bonn']);
    assert.throws(() => setup.createConfig(file, '0 8 * * *', [], 'https://discord.com/api/webhooks/123/secret', ['/bin/node']));
    assert.throws(() => setup.createConfig(path.join(__dirname, 'secret'), '0 8 * * *', [], 'https://discord.com/api/webhooks/123/secret', ['/bin/node']));
    fs.chmodSync(dir, 0o755); assert.throws(() => setup.loadConfig(file));
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});
test('notification disables redirects and mentions and reports HTTP failure without leaking URL', async () => {
  const url = 'https://discord.com/api/webhooks/123/secret'; let options;
  await setup.sendNotification(url, 'hello', {fetch: async (_url, opts) => { options = opts; return {status: 204}; }});
  assert.equal(options.redirect, 'manual'); assert.deepEqual(JSON.parse(options.body).allowed_mentions, {parse:[]});
  await assert.rejects(setup.sendNotification(url, 'hello', {fetch: async () => ({})}));
  await assert.rejects(setup.sendNotification(url, 'hello', {fetch: async () => ({status:302})}), e => !e.message.includes('secret'));
  await assert.rejects(setup.sendNotification(url, 'hello', {fetch: async () => {throw Error(url);}}), e => !e.message.includes('secret'));
});
test('CLI setup previews safely and run propagates monitor failure', async () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'dticket-')); fs.chmodSync(dir, 0o700);
  try {
    const file = path.join(dir, 'config.json'); let out = '', err = '', sent;
    const io = {writeOut:s => out += s, writeErr:s => err += s, promptSecret:async () => 'https://discord.com/api/webhooks/123/secret', command:['/usr/bin/node','/app/cli.cjs']};
    assert.equal(await setup.cli(['setup','--config',file,'--schedule','0 8 * * *','--','--origin','Bonn','--destination','A','--date','2027-01-01'], io), 0);
    assert.match(out, /Preview only/); assert.doesNotMatch(out + err, /secret/);
    assert.equal(await setup.cli(['run','--config',file], {...io, runMonitor:async args => ({status:1, stdout:'partial'}), notify:async (_url, text) => {sent = text;}}), 1);
    assert.match(sent, /partial or unknown/i);
    assert.equal(await setup.cli(['run','--config',file], {...io, runMonitor:async () => ({status:0, stdout:'ok'}), notify:async () => {throw Error('secret');}}), 1);
    assert.doesNotMatch(err, /secret/);
  } finally {fs.rmSync(dir, {recursive:true, force:true});}
});
test('validates Discord webhook URL strictly', () => {
  assert.equal(setup.validateWebhook('https://discord.com/api/webhooks/123/abc_-'), 'https://discord.com/api/webhooks/123/abc_-');
  for (const s of ['http://discord.com/api/webhooks/123/a', 'https://discord.com.evil/api/webhooks/1/a', 'https://discord.com/api/webhooks/1/a?x=1', 'https://discord.com/api/webhooks/1/a\n']) assert.throws(() => setup.validateWebhook(s));
});

test('interactive setup asks route and stores answers privately', async () => {
  const {PassThrough, Writable} = require('node:stream');
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'dticket-')); fs.chmodSync(dir, 0o700);
  const input = new PassThrough(); let text = ''; const output = new Writable({write(c,e,cb){ text += c; cb(); }});
  const file = path.join(dir, 'config.json');
  try {
    const promise = setup.cli(['setup'], {input, output, writeOut:s=>text+=s, writeErr:s=>text+=s, promptSecret:async()=> 'https://discord.com/api/webhooks/123/secret', command:['node','cli']});
    for (const answer of ['Bangkok','Chiang Mai','2027-01-01,2027-01-02','','0 8 * * *',file]) { await new Promise(r=>setTimeout(r,10)); input.write(answer+'\n'); }
    assert.equal(await promise, 0);
    assert.deepEqual(setup.loadConfig(file).arguments, ['--origin','Bangkok','--destination','Chiang Mai','--date','2027-01-01','--date','2027-01-02']);
    assert.match(text, /origin/i); assert.doesNotMatch(text, /secret/);
  } finally {input.destroy(); fs.rmSync(dir,{recursive:true,force:true});}
});

test('CLI advertises setup and run', () => {
  const result = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname,'../dticket-cli.cjs'),'--help'], {encoding:'utf8'});
  assert.equal(result.status, 0); assert.match(result.stdout, /setup/); assert.match(result.stdout, /run/);
});
test('monitor subprocess kills at timeout and bounds output', async () => {
  const {EventEmitter} = require('node:events'); const {PassThrough} = require('node:stream');
  const runner = require('../dticket-setup.cjs').runMonitor; let child;
  const result = await runner(['--origin','A'], {timeoutMs:20, spawn: (exe,args,opts) => {
    child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = signal => { child.signal=signal; child.emit('close',null,signal); };
    process.nextTick(()=> child.stdout.write('x'.repeat(200000))); return child;
  }});
  assert.equal(child.signal,'SIGKILL'); assert.equal(result.status,1); assert.ok(result.stdout.length <= 100000);
});

test('run rejects a webhook embedded in monitor arguments', async () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'dticket-')); fs.chmodSync(dir, 0o700);
  try { const url='https://discord.com/api/webhooks/123/secret', file=path.join(dir,'c');
    assert.throws(()=>setup.createConfig(file,'0 8 * * *',['--origin',url],url,['node']));
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('package test script covers all node tests and package excludes private data', () => {
  const pkg = require('../package.json'); assert.equal(pkg.private,true); assert.match(pkg.scripts.test,/\*\.test\.cjs/);
  assert.deepEqual(pkg.files.sort(), ['dticket-cli.cjs','dticket-readonly.cjs','dticket-setup.cjs'].sort());
});

test('run never sends webhook fragments from child output', async () => {
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(),'dticket-')); fs.chmodSync(dir,0o700);
 try { const file=path.join(dir,'c'), url='https://discord.com/api/webhooks/123/secret';
 setup.createConfig(file,'0 8 * * *',[],url,['node']); let sent='';
 await setup.cli(['run','--config',file],{runMonitor:async()=>({status:0,stdout:'x'.repeat(99990)+url}),notify:async(_url,text)=>{sent=text;}});
 assert.doesNotMatch(sent,/https:\/\/di|discord|secret/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('run integrates child output and mocked webhook without passing secret to child', async () => {
 const {EventEmitter}=require('node:events'), {PassThrough}=require('node:stream');
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(),'dticket-')); fs.chmodSync(dir,0o700);
 try {const file=path.join(dir,'c'), url='https://discord.com/api/webhooks/123/secret';
 setup.createConfig(file,'0 8 * * *',['--origin','A','--destination','B','--date','2027-01-01'],url,['node']);
 let sent; const spawn=(exe,args,opts)=>{assert.ok(!args.join(' ').includes(url)); assert.equal(opts.shell,false); const c=new EventEmitter(); c.stdout=new PassThrough(); c.kill=()=>{}; process.nextTick(()=>{c.stdout.write('available'); c.emit('close',0);}); return c;};
 const status=await setup.cli(['run','--config',file],{runMonitor:args=>setup.runMonitor(args,{spawn}),notify:(u,text)=>setup.sendNotification(u,text,{fetch:async (_u,o)=>{sent=JSON.parse(o.body); return {status:204};}})});
 assert.equal(status,0); assert.match(sent.content,/available/); assert.deepEqual(sent.allowed_mentions,{parse:[]});
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

test('setup validates route and private directory before asking for webhook', async () => {
 const dir=fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(),'dticket-')); fs.chmodSync(dir,0o700); let prompted=0;
 try { const io={command:['node'],promptSecret:async()=>{prompted++; return 'https://discord.com/api/webhooks/1/a';},writeErr:()=>{}};
   assert.equal(await setup.cli(['setup','--config',path.join(dir,'c'),'--schedule','0 8 * * *','--','--origin','A'],io),2);
   assert.equal(prompted,0);
   assert.equal(await setup.cli(['setup','--config',path.join(dir,'missing','c'),'--schedule','0 8 * * *','--','--origin','A','--destination','B','--date','2027-01-01'],io),2);
   assert.equal(prompted,0);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});

 test('successful child with oversized output reports partial', async () => {
 const {EventEmitter}=require('node:events'), {PassThrough}=require('node:stream');
 const result=await setup.runMonitor([], {spawn:()=>{const c=new EventEmitter(); c.stdout=new PassThrough(); c.kill=()=>{}; process.nextTick(()=>{c.stdout.write('x'.repeat(100001)); c.emit('close',0);}); return c;}});
 assert.equal(result.status,1); assert.equal(result.truncated,true);
 });

 test('notification does not wait for stalled response cancellation', async () => {
 const outcome=await Promise.race([setup.sendNotification('https://discord.com/api/webhooks/1/a','ok',{fetch:async()=>({status:204,body:{cancel:()=>new Promise(()=>{})}})}).then(()=> 'done'),new Promise(r=>setTimeout(()=>r('stalled'),50))]);
 assert.equal(outcome,'done');
 });
