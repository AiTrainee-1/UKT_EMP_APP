// The page the "My journey" WebView shows: Leaflet + OpenStreetMap, the same map stack as the HR portal's Journey History.
// The route, numbered stops, dashed "no location" gaps and event markers all come from buildMapPayload (journeyModel.ts).
//
// Leaflet and the tiles come from unpkg / openstreetmap.org (a pinned Leaflet version). If either cannot load (no internet
// for the web view, a blocked host) the page draws the same route on a plain SVG canvas instead, so the journey is never a
// blank box.
import { formatClock, formatDuration } from './format.ts';
import type { MapPayload } from './journeyModel.ts';

export const LEAFLET_VERSION = '1.9.4';

export interface MapTheme {
  dark: boolean;
}

/** JSON that is safe to place inside a <script> element. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** The payload with every label already formatted, so the page itself has no formatting code to get wrong. */
export function pagePayload(p: MapPayload) {
  return {
    route: p.route,
    start: p.start,
    end: p.end,
    stops: p.stops.map((s) => ({
      n: s.n,
      lat: s.lat,
      lng: s.lng,
      title: `Stop ${s.n}`,
      when: [formatClock(s.from), formatClock(s.to)].filter(Boolean).join(' - '),
      dur: formatDuration(s.durationS),
      address: s.address,
    })),
    gaps: p.gaps.map((g) => ({ from: g.from, to: g.to, title: g.cause, when: formatClock(g.startedAt), dur: formatDuration(g.durationS) })),
    events: p.events.map((e) => ({ lat: e.lat, lng: e.lng, title: e.label, when: formatClock(e.at), problem: e.problem })),
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
  .pin{width:26px;height:26px;border-radius:13px;background:#1E3A8A;color:#fff;font:700 13px/26px system-ui,sans-serif;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);}
  .pin.s{background:#059669}.pin.e{background:#DC2626}
  .dot{width:12px;height:12px;border-radius:6px;background:#64748B;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);}
  .dot.bad{background:#DC2626}
  .pop b{display:block;font:700 13px system-ui,sans-serif}.pop span{display:block;font:12px system-ui,sans-serif;color:#475569}
</style>
</head><body>
<div id="map"></div>
<svg id="fallback" xmlns="http://www.w3.org/2000/svg"></svg>
<script>
(function(){
  var DATA = ${data};
  function post(m){ try{ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(m); }catch(e){} }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function pop(o){ return '<div class="pop"><b>'+esc(o.title)+'</b>'+(o.when?'<span>'+esc(o.when)+'</span>':'')+(o.dur?'<span>'+esc(o.dur)+'</span>':'')+(o.address?'<span>'+esc(o.address)+'</span>':'')+'</div>'; }

  function drawSvg(){
    document.getElementById('map').style.display='none';
    var svg=document.getElementById('fallback'); svg.style.display='block';
    var pts=[].concat(DATA.route, DATA.stops.map(function(s){return [s.lat,s.lng];}), DATA.events.map(function(e){return [e.lat,e.lng];}));
    if(!pts.length){ post('empty'); return; }
    var minLat=1e9,maxLat=-1e9,minLng=1e9,maxLng=-1e9;
    pts.forEach(function(p){minLat=Math.min(minLat,p[0]);maxLat=Math.max(maxLat,p[0]);minLng=Math.min(minLng,p[1]);maxLng=Math.max(maxLng,p[1]);});
    var W=window.innerWidth||360,H=window.innerHeight||300,pad=28;
    var k=Math.cos((minLat+maxLat)/2*Math.PI/180);
    var spanX=Math.max((maxLng-minLng)*k,1e-5),spanY=Math.max(maxLat-minLat,1e-5);
    var sc=Math.min((W-2*pad)/spanX,(H-2*pad)/spanY);
    function X(lng){return pad+((lng-minLng)*k)*sc+((W-2*pad)-spanX*sc)/2;}
    function Y(lat){return H-pad-((lat-minLat))*sc-((H-2*pad)-spanY*sc)/2;}
    var NS='http://www.w3.org/2000/svg'; svg.setAttribute('viewBox','0 0 '+W+' '+H);
    function el(n,a,t){var e=document.createElementNS(NS,n);for(var k2 in a)e.setAttribute(k2,a[k2]);if(t)e.textContent=t;svg.appendChild(e);return e;}
    if(DATA.route.length>1) el('polyline',{points:DATA.route.map(function(p){return X(p[1])+','+Y(p[0]);}).join(' '),fill:'none',stroke:'#1E3A8A','stroke-width':4,'stroke-linejoin':'round'});
    DATA.gaps.forEach(function(g){el('line',{x1:X(g.from[1]),y1:Y(g.from[0]),x2:X(g.to[1]),y2:Y(g.to[0]),stroke:'#EA580C','stroke-width':3,'stroke-dasharray':'6 8'});});
    DATA.events.forEach(function(e){el('circle',{cx:X(e.lng),cy:Y(e.lat),r:5,fill:e.problem?'#DC2626':'#64748B',stroke:'#fff','stroke-width':2});});
    DATA.stops.forEach(function(s){el('circle',{cx:X(s.lng),cy:Y(s.lat),r:12,fill:'#1E3A8A',stroke:'#fff','stroke-width':2});el('text',{x:X(s.lng),y:Y(s.lat)+4,'text-anchor':'middle',fill:'#fff','font-size':12,'font-weight':700},String(s.n));});
    if(DATA.start) el('circle',{cx:X(DATA.start[1]),cy:Y(DATA.start[0]),r:9,fill:'#059669',stroke:'#fff','stroke-width':2});
    if(DATA.end) el('circle',{cx:X(DATA.end[1]),cy:Y(DATA.end[0]),r:9,fill:'#DC2626',stroke:'#fff','stroke-width':2});
    post('ready-fallback');
  }

  function drawMap(){
    var L=window.L;
    var map=L.map('map',{zoomControl:true,attributionControl:true});
    var tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    var bounds=[];
    if(DATA.route.length>1){ L.polyline(DATA.route,{color:'#1E3A8A',weight:4,opacity:.9}).addTo(map); DATA.route.forEach(function(p){bounds.push(p);}); }
    DATA.gaps.forEach(function(g){ L.polyline([g.from,g.to],{color:'#EA580C',weight:3,dashArray:'6 8'}).bindPopup(pop(g)).addTo(map); bounds.push(g.from,g.to); });
    DATA.events.forEach(function(e){ L.marker([e.lat,e.lng],{icon:L.divIcon({className:'',html:'<div class="dot'+(e.problem?' bad':'')+'"></div>',iconSize:[12,12],iconAnchor:[6,6]})}).bindPopup(pop(e)).addTo(map); bounds.push([e.lat,e.lng]); });
    DATA.stops.forEach(function(s){ L.marker([s.lat,s.lng],{icon:L.divIcon({className:'',html:'<div class="pin">'+s.n+'</div>',iconSize:[26,26],iconAnchor:[13,13]})}).bindPopup(pop(s)).addTo(map); bounds.push([s.lat,s.lng]); });
    function pin(p,cls,t){ if(!p) return; L.marker(p,{icon:L.divIcon({className:'',html:'<div class="pin '+cls+'">'+t+'</div>',iconSize:[26,26],iconAnchor:[13,13]}),zIndexOffset:500}).addTo(map); bounds.push(p); }
    pin(DATA.start,'s','S'); pin(DATA.end,'e','E');
    if(bounds.length){ map.fitBounds(bounds,{padding:[28,28],maxZoom:17}); } else { map.setView([11.0168,76.9558],12); }
    var failed=0; tiles.on('tileerror',function(){ failed++; if(failed===6) post('tiles-failed'); });
    window.__focus=function(lat,lng){ map.flyTo([lat,lng],Math.max(map.getZoom(),16),{duration:.6}); };
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
