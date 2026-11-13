'use strict';
function validateSchedule(schedule) {
  if (typeof schedule !== 'string' || schedule.length > 200) throw Error('Invalid schedule');
  const fields = schedule.split(' '), ranges = [[0,59],[0,23],[1,31],[1,12],[0,7]];
  if (fields.length !== 5) throw Error('Invalid schedule');
  fields.forEach((field, i) => field.split(',').forEach(item => {
    const m = /^(\*|\d+|\d+-\d+)(?:\/(\d+))?$/.exec(item);
    if (!m) throw Error('Invalid schedule');
    const [lo, hi] = ranges[i];
    if (m[2] && (+m[2] < 1 || +m[2] > hi-lo+1)) throw Error('Invalid schedule');
    if (m[1] !== '*') {
      const nums = m[1].split('-').map(Number);
      if (nums.some(n => n < lo || n > hi) || (nums.length === 2 && nums[0] > nums[1])) throw Error('Invalid schedule');
    }
  }));
  return schedule;
}
function validateWebhook(url) {
  if (typeof url !== 'string' || url.length > 2048 || !/^https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9_-]+$/.test(url)) throw Error('Invalid webhook');
  return url;
}
const fs = require('node:fs');
const path = require('node:path');
function safeParent(file) {
  if (typeof file !== 'string' || file.length > 4096 || !path.isAbsolute(file)) throw Error('Invalid path');
  const parent = fs.realpathSync(path.dirname(file));
  const st = fs.statSync(parent);
  if (typeof process.getuid !== 'function' || st.uid !== process.getuid() || (st.mode & 0o077) || !st.isDirectory()) throw Error('Directory must be owner-private');
  for (let p = parent;; p = path.dirname(p)) {
    if (fs.existsSync(path.join(p, '.git'))) throw Error('Config must be outside Git');
    if (path.dirname(p) === p) break;
  }
  return path.join(parent, path.basename(file));
}
function validArguments(args) {
  if (!Array.isArray(args) || args.length > 100 || args.some(a => typeof a !== 'string' || a.length > 1024 || /[\0\r\n]/.test(a))) throw Error('Invalid arguments');
}
function validateSetup(file, schedule, args, command) {
  validateSchedule(schedule); validArguments(args);
  require('./dticket-cli.cjs').parse(['check', ...args]);
  file = safeParent(file);
  if (fs.existsSync(file)) throw Error('Config already exists');
  if (!Array.isArray(command) || !command.length || command.length > 20 || command.some(s => typeof s !== 'string' || !s || s.length > 4096 || /[%\r\n\0]/.test(s)) || /[%\r\n\0]/.test(file)) throw Error('Invalid cron command');
}
function createConfig(file, schedule, args, webhook, command) {
  validateSchedule(schedule); validateWebhook(webhook); validArguments(args);
  if (args.some(a => a.includes(webhook) || /discord(?:app)?\.com\/api\/webhooks\//i.test(a))) throw Error('Invalid arguments');
  file = safeParent(file);
  if (!Array.isArray(command) || !command.length || command.length > 20 || command.some(s => typeof s !== 'string' || !s || s.length > 4096 || /[%\r\n\0]/.test(s)) || /[%\r\n\0]/.test(file)) throw Error('Invalid cron command');
  const quote = s => "'" + s.replace(/'/g, "'\\''") + "'";
  const preview = schedule + ' ' + [...command, 'run', '--config', file].map(quote).join(' ');
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);
  try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, JSON.stringify({schedule, arguments: args, webhook})); }
  catch (e) { try { fs.unlinkSync(file); } catch {} throw e; } finally { fs.closeSync(fd); }
  return preview;
}
function loadConfig(file) {
  file = safeParent(file);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o600 || st.size > 128 * 1024) throw Error('Invalid config');
    const data = JSON.parse(fs.readFileSync(fd, 'utf8'));
    validateSchedule(data.schedule); validateWebhook(data.webhook); validArguments(data.arguments);
    if (data.arguments.some(a => a.includes(data.webhook) || /discord(?:app)?\.com\/api\/webhooks\//i.test(a))) throw Error('Invalid arguments');
    return data;
  } finally { fs.closeSync(fd); }
}
async function sendNotification(webhook, content, options = {}) {
  validateWebhook(webhook);
  if (typeof content !== 'string') throw Error('Invalid notification');
  let text = '', truncated = false;
  for (const char of content) { if (text.length + char.length > 1960) { truncated = true; break; } text += char; }
  if (truncated) text += '\n[truncated; inspect local run]';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await Promise.race([
      (options.fetch || globalThis.fetch)(webhook, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({content:text || 'No output', allowed_mentions:{parse:[]}}), redirect:'manual', signal:controller.signal}),
      new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('timeout')), {once:true}))
    ]);
    if (!res || !Number.isInteger(res.status) || res.status < 200 || res.status >= 300) throw Error('failure');
    if (res.body && typeof res.body.cancel === 'function') { try { Promise.resolve(res.body.cancel()).catch(() => {}); } catch {} }
  } catch { throw Error('Discord notification failed or timed out'); }
  finally {clearTimeout(timer);}
}
async function promptSecret() {
  const input = process.stdin, output = process.stderr;
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') throw Error('TTY required');
  output.write('Discord webhook URL (hidden): ');
  return new Promise((resolve, reject) => {
    let value = '', prior = input.isRaw;
    const finish = (err) => { input.removeListener('data', onData); input.removeListener('end', onEnd); input.setRawMode(!!prior); input.pause(); output.write('\n'); err ? reject(Error('Input cancelled')) : resolve(value); };
    const onEnd = () => finish(true);
    const onData = chunk => { for (const c of chunk.toString('utf8')) { if (c === '\r' || c === '\n') return finish(false); if (c === '\u0003' || c === '\u0004') return finish(true); if (c === '\u007f' || c === '\b') value = value.slice(0,-1); else if (c >= ' ' && c <= '~') { value += c; if (value.length > 2048) return finish(true); } } };
    input.setRawMode(true); input.resume(); input.on('data', onData); input.once('end', onEnd);
  });
}
function runMonitor(args, options = {}) {
  validArguments(args);
  return new Promise(resolve => {
    let child, stdout = '', timer, finished = false, truncated = false;
    const done = status => { if (finished) return; finished = true; clearTimeout(timer); resolve({status: truncated ? 1 : status, stdout, truncated}); };
    try {
      child = (options.spawn || require('node:child_process').spawn)(process.execPath, [path.join(__dirname, 'dticket-cli.cjs'), 'check', ...args], {stdio:['ignore','pipe','ignore'], shell:false});
      child.stdout.on('data', chunk => { const text = chunk.toString('utf8'); if (text.length > 100000 - stdout.length) truncated = true; stdout += text.slice(0, 100000 - stdout.length); });
      child.once('error', () => done(1));
      child.once('close', code => done(code === 0 ? 0 : 1));
      timer = setTimeout(() => { child.kill('SIGKILL'); done(1); }, options.timeoutMs || 180000);
    } catch { done(1); }
  });
}
async function cli(argv, options = {}) {
  const out = options.writeOut || (s => process.stdout.write(s));
  const err = options.writeErr || (s => process.stderr.write(s));
  try {
    if (!Array.isArray(argv) || argv.some(x => typeof x !== 'string')) throw Error();
    const action = argv[0], split = argv.indexOf('--');
    if (action === 'setup' && argv.length === 1) {
      const readline = require('node:readline/promises');
      const input = options.input || process.stdin, output = options.output || process.stderr;
      if (!options.input && !input.isTTY) throw Error('TTY required');
      const rl = readline.createInterface({input, output, terminal: !!input.isTTY});
      let origin, destination, dates, train, schedule, file;
      try {
        origin = (await rl.question('Origin: ')).trim();
        destination = (await rl.question('Destination: ')).trim();
        dates = (await rl.question('Dates (YYYY-MM-DD, comma separated): ')).split(',').map(s => s.trim());
        train = (await rl.question('Train (optional): ')).trim();
        schedule = (await rl.question('Schedule (five cron fields): ')).trim();
        file = (await rl.question('Private config path (absolute): ')).trim();
      } finally { rl.close(); }
      if (!origin || !destination || !dates.length || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10) !== d)) throw Error();
      const args = ['--origin',origin,'--destination',destination,...dates.flatMap(d => ['--date',d]),...(train ? ['--train',train] : [])];
      validateSetup(file, schedule, args, options.command);
      const webhook = await (options.promptSecret || promptSecret)();
      const preview = createConfig(file, schedule, args, webhook, options.command);
      out('Preview only; no cron changed. Install manually only after reviewing:\n' + preview + '\n');
      return 0;
    }
    const flags = argv.slice(1, split < 0 ? undefined : split), args = split < 0 ? [] : argv.slice(split + 1);
    let file, schedule;
    for (let i=0; i<flags.length; i+=2) {
      if (flags[i] === '--config' && file === undefined) file = flags[i+1];
      else if (flags[i] === '--schedule' && schedule === undefined) schedule = flags[i+1];
      else throw Error();
    }
    if (!file) throw Error();
    if (action === 'setup') {
      const command = options.command;
      validateSetup(file, schedule, args, command);
      const webhook = await (options.promptSecret || promptSecret)();
      const preview = createConfig(file, schedule, args, webhook, command);
      out('Preview only; no cron changed. Install manually only after reviewing:\n' + preview + '\n');
      return 0;
    }
    if (action !== 'run' || schedule !== undefined || split !== -1 || typeof options.runMonitor !== 'function') throw Error();
    const config = loadConfig(file);
    let result;
    let timer;
    try {
      result = await Promise.race([options.runMonitor(config.arguments), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), 180000); })]);
      if (!result || !Number.isInteger(result.status) || typeof result.stdout !== 'string') throw Error();
    } catch { result = {status:1, stdout:''}; } finally {clearTimeout(timer);}
    const status = result.status === 0 && !result.truncated && result.stdout.length <= 100000 ? 0 : 1;
    let output = result.stdout.slice(0, 100000);
    const token = config.webhook.split('/').pop();
    output = output.split(config.webhook).join('[redacted]').split(token).join('[redacted]');
    for (let i = config.webhook.length - 1; i >= 8; i--) {
      const prefix = config.webhook.slice(0, i);
      if (output.endsWith(prefix)) { output = output.slice(0, -i) + '[redacted]'; break; }
    }
    const text = (status ? 'Check partial or unknown (monitor failed)' : 'Check completed') + '\n' + output;
    try { await (options.notify || sendNotification)(config.webhook, text); }
    catch {err('Discord notification failed or timed out\n'); return 1;}
    return status;
  } catch { err('Invalid configuration, input, or inaccessible private file; setup/run aborted.\n'); return 2; }
}
module.exports = {validateSchedule, validateWebhook, createConfig, loadConfig, sendNotification, runMonitor, cli};
