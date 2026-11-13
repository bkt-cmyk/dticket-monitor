'use strict';
const BASE = 'https://dticket.railway.co.th/DTicketPublicWeb/';
class Client {
  constructor(base = BASE, timeout = 25) { this.base = new URL(base.endsWith('/') ? base : base + '/'); if (!['http:','https:'].includes(this.base.protocol)) throw Error('invalid base URL'); this.timeout = timeout; this.cookies = new Map(); }
  async request(path, data) {
    const headers = {'User-Agent':'Mozilla/5.0 (compatible; DTicketReadOnly/1.0)'};
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ');
    const opts = {method:data ? 'POST':'GET', headers, redirect:'manual', signal:AbortSignal.timeout(Math.max(1,Math.ceil(this.timeout * 1000)))};
    if (data) { headers['Content-Type']='application/x-www-form-urlencoded'; opts.body = new URLSearchParams(data); }
    const r = await fetch(new URL(path,this.base),opts);
    if (r.status >= 300 && r.status < 400) throw Error(`upstream redirect rejected: HTTP ${r.status}`);
    if (!r.ok) throw Error(`upstream HTTP ${r.status}`);
    for (const cookie of r.headers.getSetCookie()) { const [pair] = cookie.split(';'); const at=pair.indexOf('='); if (at>0) this.cookies.set(pair.slice(0,at).trim(),pair.slice(at+1).trim()); }
    const limit = 2 * 1024 * 1024;
    const reader = r.body?.getReader();
    if (!reader) return '';
    const chunks = []; let size = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { void reader.cancel().catch(() => {}); throw Error('upstream response exceeds size limit'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks, size).toString('utf8');
  }
  async init() { const text=await this.request('home/Home'); const m=text.match(/SmartUtil\.hiddenParams\.viewStateHolder\s*=\s*"([^"]+)"/); if (!m) throw Error('home page missing viewStateHolder'); this.token=m[1]; }
  async post(endpoint,data) {
    if (!['getStation','getTrip','getTrainCoach'].includes(endpoint)) throw Error('endpoint not permitted');
    const path=endpoint==='getStation'?'home/Home/getStation':`booking/booking/${endpoint}`;
    const payload=JSON.parse(await this.request(path,{...data,viewStateHolder:this.token}));
    if (!payload || payload.errorCode!=='S_SUCCESS') throw Error(`${endpoint}: unsuccessful response`);
    if (typeof payload.viewStateHolder!=='string' || !payload.viewStateHolder) throw Error(`${endpoint}: missing refreshed viewStateHolder`);
    this.token=payload.viewStateHolder; return payload.data;
  }
}
function validateStations(stations) {
  if (!Array.isArray(stations) || stations.some(s=>!s || typeof s!=='object' || !['stationId','stationNo','stationNameTh','stationNameEn'].every(k=>typeof s[k]==='string' && s[k].trim()) || !/^[0-9]+$/.test(s.stationId))) throw Error('malformed station list');
  return stations;
}
const normalize = s=>s.trim().toLocaleLowerCase();
function resolveStation(value,stations,field) {
  if (/^[0-9]+$/.test(value)) return value;
  const needle=normalize(value); const matches=stations.filter(s=>[s.stationNameTh,s.stationNameEn].some(n=>normalize(n)===needle));
  const choices = rows=>rows.slice(0,20).map(s=>`${s.stationId} ${s.stationNameTh} / ${s.stationNameEn}`).join('; ');
  if (matches.length>1) throw Error(`${field}: ambiguous station name ${value}; choose an ID: ${choices(matches)}`);
  if (!matches.length) { const suggestions=stations.filter(s=>needle && [s.stationNameTh,s.stationNameEn].some(n=>normalize(n).includes(needle))); throw Error(`${field}: unknown station name ${value}; ${suggestions.length?'possible choices: '+choices(suggestions):'use dticket station to search names'}`); }
  return matches[0].stationId;
}
async function search(api,origin,destination,dates,trains,emit) {
  let failed=false;
  for (const date of dates) {
    let trips;
    try { const [y,m,d]=date.split('-'); trips=await api.post('getTrip',{tripType:'1',provinceStartId:origin,provinceEndId:destination,dateStart:`${d}/${m}/${y}`,dateEnd:''}); if (!Array.isArray(trips) || trips.some(t=>!t || typeof t!=='object' || Array.isArray(t))) throw Error('unexpected trip list'); }
    catch(e) { failed=true; emit({date,error:`availability unknown: ${e.message}`}); continue; }
    const numbers=trains.length?trains:trips.map(t=>String(t.trainNo ?? ''));
    if (!numbers.length) emit({date,origin_id:origin,destination_id:destination,trains:[]});
    for (const train of numbers) {
      const row={date,train,origin_id:origin,destination_id:destination};
      try {
        const matching=trips.filter(t=>String(t.trainNo)===train); if (matching.length!==1) throw Error(`expected one matching train, got ${matching.length}`);
        const trip=matching[0]; if (![trip.tripId,trip.departureDate,trip.departureTime,trip.arrivalDate,trip.arrivalTime].every(x=>typeof x==='string' && x)) throw Error('malformed trip entry');
        row.departure=trip.departureDate.slice(0,10)+' '+trip.departureTime; row.arrival=trip.arrivalDate.slice(0,10)+' '+trip.arrivalTime;
        const data=await api.post('getTrainCoach',{tripId:trip.tripId,provinceStartId:origin,provinceEndId:destination});
        if (!data || !Array.isArray(data.results) || data.results.some(c=>!c || typeof c.coachSeatType!=='string' || typeof c.coachDesc!=='string')) throw Error('malformed coach response');
        const coaches=data.results.filter(c=>c.coachSeatType==='1' && c.coachDesc.includes('ผู้โดยสารทั่วไป')); if (!coaches.length) throw Error('no general-passenger sleeper category returned');
        row.sleepers=coaches.map(c=>{ if (!Number.isInteger(c.availableSeatCount) || c.availableSeatCount<0 || !Array.isArray(c.coachSeats) || !c.coachSeats.length || c.coachClass == null) throw Error('missing or invalid availability/fare fields'); const fares={}; for (const s of c.coachSeats) if (s && s.seatTypNameEn && typeof s.seatFeeAmt==='number' && Number.isFinite(s.seatFeeAmt)) fares[s.seatTypNameEn]=s.seatFeeAmt; if (!('Lower Berth' in fares) || !('Upper Berth' in fares)) throw Error('missing berth fares'); return {description:c.coachDesc,class:c.coachClass,category_available_count:c.availableSeatCount,fares_thb:fares}; });
      } catch(e) { failed=true; delete row.sleepers; row.error=`availability unknown: ${e.message}`; }
      emit(row);
    }
  }
  return failed?1:0;
}
module.exports={Client,BASE,validateStations,resolveStation,search,normalize};
