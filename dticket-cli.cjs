#!/usr/bin/env node
'use strict';
const {Client,BASE,validateStations,resolveStation,search,normalize}=require('./dticket-readonly.cjs');
const usage='dticket check --origin NAME_OR_ID --destination NAME_OR_ID --date YYYY-MM-DD [--train NUMBER] [--json]\ndticket station NAME [--json]\ndticket setup [--config PATH --schedule CRON -- CHECK_OPTIONS]\ndticket run --config PATH';
function parse(argv) {
  const command=argv.shift(); if (command==='--help' || command==='-h') return {help:true};
  if (!['check','station'].includes(command)) throw Error(usage);
  let name; if (command==='station' && argv[0] && !argv[0].startsWith('--')) name=argv.shift();
  const o={command,name,date:[],train:[],timeout:25,base:BASE,json:false};
  const allowed=new Set(['origin','destination','date','train','json','timeout']);
  while(argv.length) { const arg=argv.shift(); if (!arg.startsWith('--') || !allowed.has(arg.slice(2))) throw Error(`unknown option: ${arg}`); const key=arg.slice(2); if(key==='json'){o.json=true;continue;} const value=argv.shift(); if (!value || value.startsWith('--')) throw Error(`missing value: ${arg}`); if(key==='date'||key==='train') o[key].push(value); else o[key]=value; }
  o.timeout=Number(o.timeout); if (!Number.isFinite(o.timeout)||o.timeout<=0||o.timeout*1000>2147483647) throw Error('timeout must be positive and finite');
  if (command==='station' && (!name || !name.trim() || o.origin || o.destination || o.date.length || o.train.length)) throw Error('station requires a name without route options');
  if (command==='check' && (!o.origin || !o.destination || !o.origin.trim() || !o.destination.trim() || !o.date.length)) throw Error('check requires origin, destination and date');
  for (const d of o.date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0,10)!==d) throw Error(`invalid date: ${d}`); }
  return o;
}
function emit(row,json) { if(json) return console.log(JSON.stringify(row)); if(row.error) return console.log(`Date: ${row.date || 'unknown'}  Train: ${row.train || '-'}\n  ERROR: ${row.error}`); if(row.trains) return console.log(`Date: ${row.date}\n  No trains returned.`); console.log(`Date: ${row.date}  Train: ${row.train}\n  ${row.departure} -> ${row.arrival}`); for (const s of row.sleepers) console.log(`  ${s.description} (class ${s.class}): category count ${s.category_available_count}\n  Fares THB: ${JSON.stringify(s.fares_thb)}`); console.log('  Category count is not individual berth availability.'); }
async function main(args, options = {}) {
  if (args[0] === 'setup' || args[0] === 'run') {
    const setup = require('./dticket-setup.cjs');
    return setup.cli(args, {command:[process.execPath, __filename], runMonitor:setup.runMonitor});
  }
  let o; try { o=parse(args); } catch(e) { console.error(e.message); return 2; } if(o.help){console.log(usage);return 0;}
  let api; try { api=new Client(options.base || o.base,o.timeout); await api.init(); } catch(e) { if(o.command==='station') console.error(`station lookup failed: ${e.message}`); else emit({error:`availability unknown: ${e.message}`},o.json); return 1; }
  let stations;
  if(o.command==='station' || !/^[0-9]+$/.test(o.origin) || !/^[0-9]+$/.test(o.destination)) {
    try { stations=validateStations(await api.post('getStation',{LineId:''})); if(o.command==='station') { for(const s of stations.filter(s=>[s.stationNameTh,s.stationNameEn].some(n=>normalize(n).includes(normalize(o.name))))) { const row={station_id:s.stationId,station_no:s.stationNo,name_th:s.stationNameTh,name_en:s.stationNameEn}; console.log(o.json?JSON.stringify(row):`${row.station_id}  ${row.name_th} / ${row.name_en} (station no: ${row.station_no})`); } return 0; } o.origin=resolveStation(o.origin,stations,'origin'); o.destination=resolveStation(o.destination,stations,'destination'); }
    catch(e){ console.error(`station lookup failed: ${e.message}`); return 1; }
  }
  return search(api,o.origin,o.destination,o.date,o.train,row=>emit(row,o.json));
}
if (require.main === module) main(process.argv.slice(2)).then(code=>{process.exitCode=code;}).catch(e=>{console.error(`availability unknown: ${e.message}`);process.exitCode=1;});
module.exports = {parse, main};
