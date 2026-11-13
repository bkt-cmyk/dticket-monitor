const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const cli = path.join(__dirname, '..', 'dticket-cli.cjs');
test('CLI help shows check and station commands', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /check/);
  assert.match(result.stdout, /station/);
  assert.doesNotMatch(result.stdout, /\b(?:setup|run)\b/);
});


test('removed commands are rejected as invalid without executing them', () => {
  for (const command of ['setup', 'run']) {
    const result = spawnSync(process.execPath, [cli, command, '--invalid'], {encoding:'utf8', timeout:5000});
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /dticket check/);
    assert.match(result.stderr, /dticket station/);
  }
});

test('package includes only the read-only CLI modules', () => {
  const pkg = require('../package.json');
  assert.deepEqual([...pkg.files].sort(), ['dticket-cli.cjs', 'dticket-readonly.cjs'].sort());
});

test('read-only station and trip search keeps cookie and rotates tokens', async () => {
  const http = require('node:http');
  const {spawn} = require('node:child_process');
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const form = new URLSearchParams(body); seen.push([req.url, req.headers.cookie, form.get('viewStateHolder')]);
    if (req.method === 'GET') { res.setHeader('Set-Cookie', 'sid=abc; Path=/'); return res.end('SmartUtil.hiddenParams.viewStateHolder = "t0"'); }
    let data;
    if (req.url.endsWith('getStation')) data = [{stationId:'174',stationNo:'3035',stationNameTh:'เขาพระบาท',stationNameEn:'Khao Phrabat'}];
    else if (req.url.endsWith('getTrip')) data = [{trainNo:'42',tripId:'t',departureDate:'2026-12-25',departureTime:'20:00',arrivalDate:'2026-12-26',arrivalTime:'06:00'}];
    else data = {results:[{coachSeatType:'1',coachDesc:'ผู้โดยสารทั่วไป sleeper',coachClass:'2',availableSeatCount:2,coachSeats:[{seatTypNameEn:'Lower Berth',seatFeeAmt:800},{seatTypNameEn:'Upper Berth',seatFeeAmt:700}]}]};
    res.end(JSON.stringify({errorCode:'S_SUCCESS',viewStateHolder:'t'+seen.length,data}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const run = args => new Promise(resolve => { let out='', err=''; const script="require(process.argv[1]).main(JSON.parse(process.argv[2]), {base:process.argv[3]}).then(c=>process.exitCode=c)"; const p=spawn(process.execPath,['-e',script,cli,JSON.stringify(args),`http://127.0.0.1:${server.address().port}/`]); p.stdout.on('data',x=>out+=x); p.stderr.on('data',x=>err+=x); p.on('close',code=>resolve({code,out,err})); });
  try {
    const result = await run(['check','--origin','Khao Phrabat','--destination','174','--date','2026-12-25','--train','42','--json']);
    assert.equal(result.code,0,result.err || result.out);
    assert.equal(JSON.parse(result.out).sleepers[0].category_available_count,2);
    assert.deepEqual(seen.map(x=>x[2]),[null,'t0','t2','t3']);
    assert.ok(seen.slice(1).every(x=>x[1] === 'sid=abc'));
    const station = await run(['station','phrabat','--json']);
    assert.equal(station.code,0,station.err); assert.equal(JSON.parse(station.out).station_id,'174');
  } finally { await new Promise(resolve => server.close(resolve)); }
});


test('rejects ambiguous exact names with choices', () => {
  const {resolveStation} = require('../dticket-readonly.cjs');
  const stations = [{stationId:'1',stationNameTh:'หนึ่ง',stationNameEn:'Same'}, {stationId:'2',stationNameTh:'สอง',stationNameEn:'Same'}];
  assert.throws(()=>resolveStation('same',stations,'origin'), /ambiguous.*1.*2/);
  assert.throws(()=>resolveStation('am',stations,'origin'), /unknown.*possible choices/);
});

test('all redirects are rejected without following them', async () => {
  const http=require('node:http'); const {Client}=require('../dticket-readonly.cjs'); let count=0;
  const server=http.createServer((req,res)=>{count++;res.writeHead(302,{Location:'/capture'});res.end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try { const api=new Client(`http://127.0.0.1:${server.address().port}/`,1); await assert.rejects(api.init(),/redirect.*302/); assert.equal(count,1); }
  finally { await new Promise(r=>server.close(r)); }
});

test('fractional positive timeout is accepted for requests', async () => {
  const http=require('node:http'); const {Client}=require('../dticket-readonly.cjs');
  const server=http.createServer((req,res)=>res.end('SmartUtil.hiddenParams.viewStateHolder = "t"'));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try { await new Client(`http://127.0.0.1:${server.address().port}/`,0.5005).init(); }
  finally { await new Promise(r=>server.close(r)); }
});

test('oversized upstream bodies are rejected', async () => {
  const http=require('node:http'), {Client}=require('../dticket-readonly.cjs');
  const server=http.createServer((req,res)=>res.end('x'.repeat(3*1024*1024)));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try { await assert.rejects(new Client(`http://127.0.0.1:${server.address().port}/`,2).request('home/Home'), /response.*(large|limit)/i); }
  finally {server.closeAllConnections(); await new Promise(r=>server.close(r));}
});

test('production CLI rejects arbitrary base URLs before network access', () => {
  const r=spawnSync(process.execPath,[cli,'station','x','--base-url','http://127.0.0.1:1/'],{encoding:'utf8'});
  assert.equal(r.status,2); assert.match(r.stderr,/unknown option|base.url/i);
});
