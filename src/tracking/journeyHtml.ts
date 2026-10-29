// The page the "On-Duty Journey" WebView shows: Leaflet + OpenStreetMap, the same map stack as the HR portal's Journey History.
// The route, numbered break pins, dashed "no location" gaps and event markers all come from buildMapPayload (journeyModel.ts).
// Colours are the shared journey palette (activity.ts TONE_COLOR): the start and the end are ONE green, a break is amber under
// 15 min and purple from 15 min, travelling is blue, "no location" is grey and dashed, a fake location is red.
//
// Leaflet and the tiles come from unpkg / openstreetmap.org (a pinned Leaflet version). If either cannot load (no internet
// for the web view, a blocked host) the page draws the same route on a plain SVG canvas instead, so the journey is never a
// blank box.
import { formatClock, formatDuration } from './format.ts';
import { haversineM } from './geo.ts';
import type { MapPayload } from './journeyModel.ts';

export const LEAFLET_VERSION = '1.9.4';

/** Breaks whose centres are this close share one pin ("1 · 3"), so no number is hidden under another. */
export const SHARED_PIN_M = 15;

export interface MapTheme {
  dark: boolean;
}

/** JSON that is safe to place inside a <script> element. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export interface PagePin {
  /** "2" or "1 · 3". */
  label: string;
  lat: number;
  lng: number;
  /** Any break under this pin is 15 min or longer: purple, else amber. */
  long: boolean;
  items: { title: string; when: string; dur: string; address: string }[];
}

/** One pin per place: breaks within SHARED_PIN_M of each other share it, listed in time order. */
export function groupPins(stops: MapPayload['stops']): PagePin[] {
  const pins: PagePin[] = [];
  const ns: number[][] = [];
  for (const s of stops) {
    const i = pins.findIndex((p) => haversineM(p.lat, p.lng, s.lat, s.lng) <= SHARED_PIN_M);
    const item = {
      title: `Stop ${s.n}`,
      when: [formatClock(s.from), formatClock(s.to)].filter(Boolean).join(' - '),
      dur: `${formatDuration(s.durationS)}${s.long ? ' (15 min or longer)' : ''}`,
      address: s.address,
    };
    if (i === -1) {
      pins.push({ label: String(s.n), lat: s.lat, lng: s.lng, long: s.long, items: [item] });
      ns.push([s.n]);
    } else {
      pins[i].items.push(item);
      pins[i].long = pins[i].long || s.long;
      ns[i].push(s.n);
      pins[i].label = ns[i].join(' · ');
    }
  }
  return pins;
}

/** The payload with every label already formatted, so the page itself has no formatting code to get wrong. */
export function pagePayload(p: MapPayload) {
  return {
    route: p.route,
    start: p.start,
    end: p.end,
    startInfo: { title: 'Journey started', when: formatClock(p.startedAt) },
    endInfo: { title: p.active ? 'Last position' : 'On-duty completed', when: formatClock(p.endedAt) },
    stops: p.stops.map((s) => ({
      n: s.n,
      lat: s.lat,
      lng: s.lng,
      title: `Stop ${s.n}`,
      when: [formatClock(s.from), formatClock(s.to)].filter(Boolean).join(' - '),
      dur: formatDuration(s.durationS),
      long: s.long,
      address: s.address,
    })),
    pins: groupPins(p.stops),
    gaps: p.gaps.map((g) => ({ from: g.from, to: g.to, title: g.cause, when: formatClock(g.startedAt), dur: formatDuration(g.durationS) })),
    events: p.events.map((e) => ({ lat: e.lat, lng: e.lng, title: e.label, when: formatClock(e.at), problem: e.problem, mock: e.mock })),
  };
}

export function journeyMapHtml(payload: MapPayload, theme: MapTheme = { dark: false }): string {
  const data = safeJson(pagePayload(payload));
  const bg = theme.dark ? '#0B1220' : '#EEF2F7';
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css">
<style>
  html,body,#map,#fallback{height:100%;margin:0;padding:0;background:${bg};}
  #fallback{display:none;width:100%;}
  .pin{transform:translate(-50%,-50%);min-width:30px;height:30px;padding:0 5px;border-radius:15px;background:#d97706;color:#fff;font:700 13px/24px system-ui,sans-serif;text-align:center;border:3px solid #fff;box-sizing:border-box;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.45);}
  .pin.long{background:#7c3aed}
  .ring{width:44px;height:44px;border-radius:22px;border:3px solid #0f172a;background:rgba(15,23,42,.10);box-sizing:border-box;}
  .dot{width:12px;height:12px;border-radius:6px;background:#6b7280;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);}
  .dot.mock{background:#dc2626}
  .pop b{display:block;font:700 13px system-ui,sans-serif}.pop span{display:block;font:12px system-ui,sans-serif;color:#475569}
  .pop hr{border:0;border-top:1px solid #e2e8f0;margin:6px 0}
</style>
</head><body>
<div id="map"></div>
<svg id="fallback" xmlns="http://www.w3.org/2000/svg"></svg>
<script>
(function(){
  var DATA = ${data};
  var GREEN='#16a34a', AMBER='#d97706', PURPLE='#7c3aed', BLUE='#006496', GREY='#6b7280', RED='#dc2626';
  function post(m){ try{ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(m); }catch(e){} }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function pop(o){ return '<div class="pop"><b>'+esc(o.title)+'</b>'+(o.when?'<span>'+esc(o.when)+'</span>':'')+(o.dur?'<span>'+esc(o.dur)+'</span>':'')+(o.address?'<span>'+esc(o.address)+'</span>':'')+'</div>'; }
  function pinPop(p){ return p.items.map(pop).join('<hr>'); }

  function drawSvg(){
    document.getElementById('map').style.display='none';
    var svg=document.getElementById('fallback'); svg.style.display='block';
    var pts=[].concat(DATA.route, DATA.stops.map(function(s){return [s.lat,s.lng];}), DATA.events.map(function(e){return [e.lat,e.lng];}));
    if(!pts.length){ post('empty'); return; }
    var minLat=1e9,maxLat=-1e9,minLng=1e9,maxLng=-1e9;
    pts.forEach(function(p){minLat=Math.min(minLat,p[0]);maxLat=Math.max(maxLat,p[0]);minLng=Math.min(minLng,p[1]);maxLng=Math.max(maxLng,p[1]);});
    var W=window.innerWidth||360,H=window.innerHeight||300,pad=32;
    var k=Math.cos((minLat+maxLat)/2*Math.PI/180);
    var spanX=Math.max((maxLng-minLng)*k,1e-5),spanY=Math.max(maxLat-minLat,1e-5);
    var sc=Math.min((W-2*pad)/spanX,(H-2*pad)/spanY);
    function X(lng){return pad+((lng-minLng)*k)*sc+((W-2*pad)-spanX*sc)/2;}
    function Y(lat){return H-pad-((lat-minLat))*sc-((H-2*pad)-spanY*sc)/2;}
    var NS='http://www.w3.org/2000/svg'; svg.setAttribute('viewBox','0 0 '+W+' '+H);
    function el(n,a,t){var e=document.createElementNS(NS,n);for(var k2 in a)e.setAttribute(k2,a[k2]);if(t)e.textContent=t;svg.appendChild(e);return e;}
    if(DATA.route.length>1) el('polyline',{points:DATA.route.map(function(p){return X(p[1])+','+Y(p[0]);}).join(' '),fill:'none',stroke:BLUE,'stroke-width':4,'stroke-linejoin':'round'});
    DATA.gaps.forEach(function(g){el('line',{x1:X(g.from[1]),y1:Y(g.from[0]),x2:X(g.to[1]),y2:Y(g.to[0]),stroke:GREY,'stroke-width':3,'stroke-dasharray':'6 8'});});
    DATA.events.forEach(function(e){el('circle',{cx:X(e.lng),cy:Y(e.lat),r:5,fill:e.mock?RED:GREY,stroke:'#fff','stroke-width':2});});
    DATA.pins.forEach(function(s){var w=Math.max(30,14+s.label.length*8);el('rect',{x:X(s.lng)-w/2,y:Y(s.lat)-15,width:w,height:30,rx:15,fill:s.long?PURPLE:AMBER,stroke:'#fff','stroke-width':3});el('text',{x:X(s.lng),y:Y(s.lat)+5,'text-anchor':'middle',fill:'#fff','font-size':13,'font-weight':700},s.label);});
    if(DATA.start) el('circle',{cx:X(DATA.start[1]),cy:Y(DATA.start[0]),r:10,fill:GREEN,stroke:'#fff','stroke-width':3});
    if(DATA.end) el('circle',{cx:X(DATA.end[1]),cy:Y(DATA.end[0]),r:10,fill:GREEN,stroke:'#fff','stroke-width':3});
    post('ready-fallback');
  }

  function endPin(L,color,glyph){
    var size=32;
    var inner = glyph==='flag'
      ? '<path d="M8 20V6m0 0h8l-2 3 2 3H8" stroke="#fff" stroke-width="1.6" fill="none" stroke-linejoin="round"/>'
      : '<circle cx="12" cy="9" r="2.6" fill="#fff"/><path d="M7 18.5c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    var html='<svg width="'+size+'" height="'+(size*1.25)+'" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg"><path d="M12 29C12 29 22 17.5 22 11C22 5.5 17.5 1 12 1C6.5 1 2 5.5 2 11C2 17.5 12 29 12 29Z" fill="'+color+'" stroke="#fff" stroke-width="1.5"/><g transform="translate(0,-1.5)">'+inner+'</g></svg>';
    return L.divIcon({className:'',html:html,iconSize:[size,size*1.25],iconAnchor:[size/2,size*1.25],popupAnchor:[0,-size*1.1]});
  }

  function drawMap(){
    var L=window.L;
    var map=L.map('map',{zoomControl:true,attributionControl:true});
    var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    var bounds=[];
    if(DATA.route.length>1){ L.polyline(DATA.route,{color:BLUE,weight:5,opacity:.9}).addTo(map); DATA.route.forEach(function(p){bounds.push(p);}); }
    DATA.gaps.forEach(function(g){ L.polyline([g.from,g.to],{color:GREY,weight:3,dashArray:'6 8'}).bindPopup(pop(g)).addTo(map); bounds.push(g.from,g.to); });
    DATA.events.forEach(function(e){ L.marker([e.lat,e.lng],{icon:L.divIcon({className:'',html:'<div class="dot'+(e.mock?' mock':'')+'"></div>',iconSize:[12,12],iconAnchor:[6,6]})}).bindPopup(pop(e)).addTo(map); bounds.push([e.lat,e.lng]); });
    DATA.pins.forEach(function(s){ L.marker([s.lat,s.lng],{icon:L.divIcon({className:'',html:'<div class="pin'+(s.long?' long':'')+'">'+esc(s.label)+'</div>',iconSize:null,iconAnchor:[0,0],popupAnchor:[0,-15]}),zIndexOffset:200}).bindPopup(pinPop(s)).addTo(map); bounds.push([s.lat,s.lng]); });
    if(DATA.start){ L.marker(DATA.start,{icon:endPin(L,GREEN,'flag'),zIndexOffset:500}).bindPopup(pop(DATA.startInfo)).addTo(map); bounds.push(DATA.start); }
    if(DATA.end){ L.marker(DATA.end,{icon:endPin(L,GREEN,'person'),zIndexOffset:400}).bindPopup(pop(DATA.endInfo)).addTo(map); bounds.push(DATA.end); }
    if(bounds.length){ map.fitBounds(bounds,{padding:[32,32],maxZoom:17}); } else { map.setView([11.0168,76.9558],12); }
    var failed=0; tiles.on('tileerror',function(){ failed++; if(failed===6) post('tiles-failed'); });
    var ring=null;
    window.__focus=function(lat,lng){
      if(ring){ map.removeLayer(ring); }
      ring=L.marker([lat,lng],{icon:L.divIcon({className:'',html:'<div class="ring"></div>',iconSize:[44,44],iconAnchor:[22,22]}),interactive:false,zIndexOffset:-100}).addTo(map);
      map.flyTo([lat,lng],Math.max(map.getZoom(),16),{duration:.6});
    };
    post('ready');
  }

  function start(){
    if(window.L){ try{ drawMap(); return; }catch(e){ post('error:'+(e&&e.message)); } }
    drawSvg();
  }
  var s=document.createElement('script'); s.src='https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js';
  s.onload=start; s.onerror=function(){ drawSvg(); };
  document.head.appendChild(s);
  window.__focus=window.__focus||function(){};
})();
</script>
</body></html>`;
}
