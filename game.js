(function(){
'use strict';
// ---------- config ----------
var WW = 2000, WH = 1000;               // world size
var DIFFS = {
  easy:   { name:'Easy',   color:'#3ddc84', aim:3.4, cool:2.6, dmg:8,  heal:30, sway:2.2, duck:0.0, spawn:2.2, desc:'Slow enemies, light damage, steady scope' },
  medium: { name:'Medium', color:'#ffb347', aim:2.4, cool:1.9, dmg:12, heal:25, sway:3.6, duck:0.35, spawn:1.6, desc:'Faster aim, enemies sometimes duck' },
  hard:   { name:'Hard',   color:'#ff5a47', aim:1.7, cool:1.3, dmg:17, heal:20, sway:5.0, duck:0.65, spawn:1.1, desc:'Quick shooters, heavy damage, shaky scope' }
};
var ENEMY_ACC = 0.40, MAX_ENEMIES = 2, ZOOM = 3.2, FIRE_COOLDOWN = 0.75, BODY_PTS = 5, HEAD_PTS = 10;

// ---------- canvas ----------
var cv = document.getElementById('c'), ctx = cv.getContext('2d');
var SW = 0, SH = 0, DPR = 1, SC = 1, VW = WW, VH = WH;
var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
function resize(){
  DPR = Math.min(2, window.devicePixelRatio || 1);
  SW = window.innerWidth; SH = window.innerHeight;
  cv.width = Math.round(SW * DPR); cv.height = Math.round(SH * DPR);
  SC = Math.max(SW / WW, SH / WH);
  VW = SW / SC; VH = SH / SC;
  clampCam();
  document.getElementById('rot').hidden = !(isTouch && SH > SW);
}
window.addEventListener('resize', resize);

// ---------- deterministic city ----------
var seed = 7;
function rnd(){ seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
var far = [], mid = [], spawns = [], stars = [];
(function buildCity(){
  var x = -40;
  while (x < WW + 40){ var w = 60 + rnd()*120; far.push({x:x, w:w, top:330 + rnd()*230}); x += w - 10; }
  x = 30;
  var i = 0;
  while (x < WW - 120){
    var w2 = 170 + rnd()*150, top = 380 + rnd()*230, depth = 0.75 + rnd()*0.45;
    var b = { x:x, w:w2, top:top, depth:depth, id:i, hue: 210 + rnd()*25, light: 13 + rnd()*7, win:[] };
    // windows
    var cols = Math.max(2, Math.floor(w2 / 46)), rows = Math.floor((880 - top - 60) / 62);
    var cw = (w2 - 30) / cols;
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++){
      var wx = x + 15 + c*cw + cw*0.18, wy = top + 50 + r*62, ww = cw*0.64, wh = 36;
      var lit = rnd() < 0.35;
      b.win.push({x:wx, y:wy, w:ww, h:wh, lit:lit, warm: rnd() < 0.7});
    }
    // roof spawn points
    var n = Math.max(1, Math.floor(w2 / 110));
    for (var k = 0; k < n; k++) spawns.push({ type:'roof', b:i, x: x + 40 + (k + 0.5) * ((w2 - 80) / n), y: top, s: depth });
    // window spawn points (upper rows only, chest-high cover)
    b.win.forEach(function(wd, wi){ if (wd.y < top + 50 + 62*3 && wi % 2 === 0 && wd.w > 30) spawns.push({ type:'win', b:i, x: wd.x + wd.w/2, y: wd.y + wd.h, s: depth * 0.8, win: wd }); });
    b.rooftop = { ac: rnd() < 0.6, acx: x + w2*(0.2 + rnd()*0.5), tank: rnd() < 0.4, tankx: x + w2*(0.15 + rnd()*0.6), ant: rnd() < 0.5 };
    mid.push(b);
    x += w2 + 30 + rnd()*90; i++;
  }
  for (var s = 0; s < 120; s++) stars.push({x: rnd()*WW, y: rnd()*360, r: rnd()*1.3 + 0.3, t: rnd()*6});
})();

// ---------- state ----------
var G = null, cam = {x: (WW - 1000)/2, y: 0}, cross = {x: WW/2, y: 470};
var mouse = {x: 0, y: 0, inside: false}, scoped = false, paused = false, running = false, muted = false;
var best = {}; try { best = JSON.parse(localStorage.getItem('rs_best') || '{}') || {}; } catch(e){ best = {}; }
function saveBest(){ try { localStorage.setItem('rs_best', JSON.stringify(best)); } catch(e){} }

function newGame(diffKey){
  var D = DIFFS[diffKey];
  G = { key: diffKey, D: D, t: 0, score: 0, kills: 0, heads: 0, shots: 0, hits: 0, hp: 100,
        enemies: [], packs: [], packT: 9, fx: [], floats: [], spawnT: 0.8, cool: 0, hurt: 0, shake: 0, ramp: 1, over: false, lastSpot: [] };
  cross.x = WW/2; cross.y = 480; cam.x = cross.x - VW/2; cam.y = (WH - VH)/2; clampCam();
  scoped = false; updateScopeBtn();
  running = true; paused = false;
  show('menu', false); show('over', false); show('pause', false);
  show('hud', true); show('ctrls', isTouch);
  var h = document.getElementById('hint');
  h.textContent = isTouch ? 'Drag anywhere to aim · SCOPE to zoom · FIRE to shoot' : 'Move mouse to aim · Right-click / Space to scope · Click to shoot';
  h.hidden = false; h.style.opacity = 1; setTimeout(function(){ h.style.opacity = 0; }, 4500);
  updateHud();
}

// ---------- enemies ----------
function spawnEnemy(){
  var free = spawns.filter(function(sp){
    for (var i = 0; i < G.enemies.length; i++){ var e = G.enemies[i]; if (Math.abs(e.sp.x - sp.x) < 260) return false; }
    return G.lastSpot.indexOf(sp) < 0;
  });
  if (!free.length) return;
  // prefer spots not too far from current view so action stays findable
  var sp = free[Math.floor(Math.random()*free.length)];
  G.lastSpot.push(sp); if (G.lastSpot.length > 4) G.lastSpot.shift();
  var D = G.D;
  G.enemies.push({ sp: sp, s: sp.s, state: 'rise', t: 0, rise: 0, aimT: D.aim * G.ramp * (0.85 + Math.random()*0.3), dead: false,
    fall: 0, flash: 0, shotsFired: 0, face: sp.x < cross.x ? 1 : -1, ducking: false });
}
function enemyGeom(e){
  // returns head & body in world coords given current rise
  var s = e.s * 1.15, hide = (1 - e.rise) * 78 * s;
  var bx = e.sp.x, by = e.sp.y + hide;
  return { s: s, x: bx, y: by, headX: bx, headY: by - 60*s, headR: 9.5*s,
           bodyL: bx - 13*s, bodyR: bx + 13*s, bodyT: by - 50*s, bodyB: by, cover: e.sp.y };
}

function updateEnemies(dt){
  var D = G.D;
  for (var i = G.enemies.length - 1; i >= 0; i--){
    var e = G.enemies[i]; e.t += dt; if (e.flash > 0) e.flash -= dt;
    if (e.dead){ e.fall += dt; if (e.fall > 1.4) G.enemies.splice(i, 1); continue; }
    if (e.state === 'rise'){ e.rise = Math.min(1, e.rise + dt*2.2); if (e.rise >= 1){ e.state = 'aim'; e.t = 0; } }
    else if (e.state === 'aim'){
      if (e.t >= e.aimT){ enemyFire(e); e.state = 'cool'; e.t = 0; e.coolT = D.cool * G.ramp * (0.8 + Math.random()*0.4);
        e.ducking = Math.random() < D.duck; }
    }
    else if (e.state === 'cool'){
      if (e.ducking){ e.rise = Math.max(0, e.rise - dt*3); }
      if (e.t >= e.coolT){ e.state = e.ducking ? 'rise' : 'aim'; e.t = 0; e.aimT = D.aim * G.ramp * (0.7 + Math.random()*0.3); }
    }
  }
}
function enemyFire(e){
  e.flash = 0.12; e.shotsFired++;
  var g = enemyGeom(e);
  sfx('enemy', e.s);
  if (Math.random() < ENEMY_ACC){
    G.hp = Math.max(0, G.hp - G.D.dmg);
    G.hurt = 0.6; G.shake = 0.35;
    floatText(cam.x + VW/2, cam.y + VH*0.62, '-' + G.D.dmg, '#ff5a47', true);
    sfx('hurt');
    if (navigator.vibrate) try { navigator.vibrate(80); } catch(err){}
    if (G.hp <= 0) endGame();
  } else {
    // ricochet spark on our parapet
    var sx = cam.x + VW*(0.25 + Math.random()*0.5);
    G.fx.push({ type:'spark', x: sx, y: 905 + Math.random()*15, t: 0 });
    floatText(sx, 880, 'MISS', '#9fb0c6', false, true);
    sfx('ric');
  }
  updateHud();
}

// ---------- health packs ----------
function spawnPack(){
  var roofs = spawns.filter(function(sp){ return sp.type === 'roof' && !G.enemies.some(function(e){ return !e.dead && Math.abs(e.sp.x - sp.x) < 120; }); });
  if (!roofs.length) return;
  roofs.sort(function(a, b){ return Math.abs(a.x - cross.x) - Math.abs(b.x - cross.x); });
  var sp = roofs[Math.floor(Math.random() * Math.min(roofs.length, 6))];
  G.packs.push({ x: sp.x + (Math.random() - 0.5) * 40, y: 60, landY: sp.y, s: sp.s * 1.1, state: 'fall', t: 0, life: 7, b: sp.b, sway: Math.random() * 6 });
  floatText(cam.x + VW/2, cam.y + 140, '✚ HEALTH PACK INCOMING', '#3ddc84', false, true);
  sfx('pack');
}
function packBox(p){ var h = 22 * p.s; return { l: p.x - h/2, r: p.x + h/2, t: p.y - h, b: p.y }; }
function updatePacks(dt){
  for (var i = G.packs.length - 1; i >= 0; i--){
    var p = G.packs[i]; p.t += dt;
    if (p.state === 'fall'){ p.y += 75 * dt; p.x += Math.sin(p.t * 1.3 + p.sway) * 12 * dt; if (p.y >= p.landY){ p.y = p.landY; p.state = 'land'; p.t = 0; } }
    else if (p.state === 'land'){ if (p.t >= p.life) G.packs.splice(i, 1); }
    else if (p.state === 'taken'){ if (p.t > 0.5) G.packs.splice(i, 1); }
  }
}
function drawPack(p, t){
  var bx = packBox(p), h = bx.r - bx.l;
  if (p.state === 'land' && p.life - p.t < 2.5 && Math.sin(t * 18) > 0) return;
  ctx.save();
  if (p.state === 'taken'){ ctx.globalAlpha = Math.max(0, 1 - p.t / 0.5); ctx.translate(p.x, bx.t); ctx.scale(1 + p.t, 1 + p.t); ctx.translate(-p.x, -bx.t); }
  if (p.state === 'fall'){
    var cy = bx.t - 46 * p.s;
    ctx.fillStyle = '#e8edf5'; ctx.beginPath(); ctx.arc(p.x, cy, 26 * p.s, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff5a47'; ctx.beginPath(); ctx.moveTo(p.x, cy); ctx.arc(p.x, cy, 26 * p.s, Math.PI * 1.33, Math.PI * 1.67); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(230,236,245,.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x - 26 * p.s, cy); ctx.lineTo(bx.l, bx.t); ctx.moveTo(p.x + 26 * p.s, cy); ctx.lineTo(bx.r, bx.t); ctx.moveTo(p.x, cy); ctx.lineTo(p.x, bx.t); ctx.stroke();
  }
  var gl = 0.35 + 0.25 * Math.sin(t * 5);
  ctx.fillStyle = 'rgba(61,220,132,' + gl + ')'; ctx.beginPath(); ctx.arc(p.x, (bx.t + bx.b) / 2, h * 0.95, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f6fa'; roundRect(bx.l, bx.t, h, h, 3 * p.s); ctx.fill();
  ctx.strokeStyle = '#9aa6b8'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#e8322a'; var a = h * 0.18, c = h * 0.62;
  ctx.fillRect(p.x - a/2, bx.t + (h - c)/2, a, c); ctx.fillRect(p.x - c/2, bx.t + h/2 - a/2, c, a);
  ctx.restore();
}

// ---------- player shooting ----------
function swayOffset(){
  var D = G ? G.D : DIFFS.easy, t = G ? G.t : 0;
  var a = D.sway;
  return { x: Math.sin(t*1.1)*a + Math.sin(t*2.7 + 1)*a*0.45, y: Math.sin(t*1.6 + 2)*a*0.8 + Math.cos(t*3.1)*a*0.3 };
}
function shoot(){
  if (!running || paused || !G || G.over) return;
  if (G.cool > 0) return;
  G.cool = FIRE_COOLDOWN; G.shots++;
  ensureAudio(); sfx('shot');
  G.shake = Math.max(G.shake, scoped ? 0.18 : 0.12);
  var px = cross.x, py = cross.y;
  if (scoped){ var sw = swayOffset(); px += sw.x; py += sw.y; }
  else { var a = Math.random()*Math.PI*2, r = Math.sqrt(Math.random()) * 16; px += Math.cos(a)*r; py += Math.sin(a)*r; }
  // health packs first
  for (var pi = 0; pi < G.packs.length; pi++){
    var pk = G.packs[pi]; if (pk.state === 'taken') continue;
    var bb = packBox(pk), pad = 4;
    if (px >= bb.l - pad && px <= bb.r + pad && py >= bb.t - pad && py <= bb.b + pad){
      var before = G.hp; G.hp = Math.min(100, G.hp + G.D.heal); G.hits++;
      pk.state = 'taken'; pk.t = 0;
      floatText(pk.x, bb.t - 14, '+' + (G.hp - before) + ' HP', '#3ddc84');
      G.healFx = 0.6; sfx('heal'); G.hitMarker = { t: 0.35, head: false };
      updateHud(); return;
    }
  }
  // test enemies (nearest first)
  var hit = null, part = '';
  G.enemies.slice().sort(function(a, b){ return b.s - a.s; }).forEach(function(e){
    if (hit || e.dead) return;
    var g = enemyGeom(e);
    if (py > g.cover) return; // behind cover
    if (e.sp.type === 'win'){ var w = e.sp.win; if (px < w.x || px > w.x + w.w || py < w.y) return; }
    var dx = px - g.headX, dy = py - g.headY;
    if (dx*dx + dy*dy <= g.headR*g.headR*1.15){ hit = e; part = 'head'; return; }
    if (px >= g.bodyL && px <= g.bodyR && py >= g.bodyT && py <= g.bodyB){ hit = e; part = 'body'; }
  });
  if (hit){
    G.hits++; hit.dead = true; hit.hitPart = part; G.kills++;
    var pts = part === 'head' ? HEAD_PTS : BODY_PTS; G.score += pts;
    if (part === 'head') G.heads++;
    var g2 = enemyGeom(hit);
    floatText(g2.x, g2.headY - 18*g2.s, (part === 'head' ? 'HEADSHOT +' : 'BODY +') + pts, part === 'head' ? '#ffd45a' : '#ffffff');
    G.fx.push({ type:'puff', x: px, y: py, t: 0, s: hit.s });
    sfx(part === 'head' ? 'head' : 'hit');
    G.hitMarker = { t: 0.35, head: part === 'head' };
    if (G.kills % 8 === 0) G.ramp = Math.max(0.6, G.ramp * 0.92);
  } else {
    G.fx.push({ type:'dust', x: px, y: py, t: 0 });
  }
  updateHud();
}

// ---------- fx ----------
function floatText(x, y, txt, color, screen, small){ G.floats.push({ x:x, y:y, txt:txt, color:color, t:0, small: !!small }); }

// ---------- loop ----------
var last = performance.now();
function frame(now){
  var dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (running && !paused && G && !G.over) update(dt);
  else if (!running) { menuT += dt; cross.x = WW/2 + Math.sin(menuT*0.4)*420; cross.y = 470 + Math.sin(menuT*0.7)*60; followCam(dt, true); }
  render();
  requestAnimationFrame(frame);
}
var menuT = 0;
function update(dt){
  G.t += dt;
  if (G.cool > 0) G.cool -= dt;
  if (G.hurt > 0) G.hurt -= dt;
  if (G.healFx > 0) G.healFx -= dt;
  if (G.shake > 0) G.shake -= dt;
  if (G.hitMarker && (G.hitMarker.t -= dt) <= 0) G.hitMarker = null;
  var alive = G.enemies.filter(function(e){ return !e.dead; }).length;
  if (alive < MAX_ENEMIES){ G.spawnT -= dt; if (G.spawnT <= 0){ spawnEnemy(); G.spawnT = G.D.spawn * (0.7 + Math.random()*0.6); } }
  updateEnemies(dt);
  G.packT -= dt;
  if (G.packT <= 0 && G.packs.length === 0){ spawnPack(); G.packT = 14 + Math.random()*10; }
  updatePacks(dt);
  G.fx = G.fx.filter(function(f){ f.t += dt; return f.t < 0.8; });
  G.floats = G.floats.filter(function(f){ f.t += dt; return f.t < 1.2; });
  followCam(dt, false);
  var fb = document.getElementById('fireBtn'); fb.classList.toggle('cool', G.cool > 0);
}
function followCam(dt, auto){
  // keep crosshair inside the view; pan when it nears edges
  var mx = scoped ? VW * 0.5 : VW * 0.28, my = scoped ? VH * 0.5 : VH * 0.22;
  var tx = cam.x, ty = cam.y;
  if (cross.x < cam.x + mx) tx = cross.x - mx; else if (cross.x > cam.x + VW - mx) tx = cross.x - VW + mx;
  if (cross.y < cam.y + my) ty = cross.y - my; else if (cross.y > cam.y + VH - my) ty = cross.y - VH + my;
  var k = Math.min(1, dt * (auto ? 2 : 10));
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  // mouse edge-pan (desktop): moving the mouse to the screen edge keeps panning
  if (!isTouch && mouse.inside && running && !paused){
    var ex = SW * 0.06, sp = 900 * dt;
    if (mouse.x < ex) { cross.x -= sp; } else if (mouse.x > SW - ex) { cross.x += sp; }
    if (mouse.x < ex || mouse.x > SW - ex) clampCross();
  }
  clampCam();
}
function clampCam(){ cam.x = Math.max(0, Math.min(WW - VW, cam.x)); cam.y = Math.max(0, Math.min(WH - VH, cam.y)); if (VW >= WW) cam.x = (WW - VW)/2; if (VH >= WH) cam.y = (WH - VH)/2; }
function clampCross(){ cross.x = Math.max(10, Math.min(WW - 10, cross.x)); cross.y = Math.max(80, Math.min(WH - 60, cross.y)); }

// ---------- rendering ----------
function render(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  var shx = 0, shy = 0;
  if (G && G.shake > 0){ var m = G.shake * 14; shx = (Math.random()-0.5)*m; shy = (Math.random()-0.5)*m; }
  var t = G ? G.t : menuT;
  if (scoped && G && running){
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, SW, SH);
    var R = Math.min(SW, SH) * (isTouch ? 0.40 : 0.36);
    var cx = SW / 2, cy = SH / 2 + (SH < 500 ? 12 : 0);
    var sw = swayOffset();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx + shx, cy + shy, R, 0, Math.PI*2); ctx.clip();
    var z = SC * ZOOM;
    ctx.translate(cx + shx, cy + shy); ctx.scale(z, z); ctx.translate(-(cross.x + sw.x), -(cross.y + sw.y));
    drawWorld(t, true);
    ctx.restore();
    // lens vignette
    var gr = ctx.createRadialGradient(cx, cy, R*0.72, cx, cy, R);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.85)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();
    // reticle
    ctx.strokeStyle = 'rgba(10,10,10,.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 10, cy); ctx.moveTo(cx + 10, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - 10); ctx.moveTo(cx, cy + 10); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.lineWidth = 5; ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx - R*0.55, cy); ctx.moveTo(cx + R*0.55, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy + R*0.55); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.lineWidth = 1.5;
    for (var k = 1; k <= 4; k++){ var yy = cy + k * R*0.1; ctx.beginPath(); ctx.moveTo(cx - 6 + k, yy); ctx.lineTo(cx + 6 - k, yy); ctx.stroke(); }
    ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R - 1.5, 0, Math.PI*2); ctx.stroke();
    if (G.cool > 0){ ctx.strokeStyle = 'rgba(255,212,90,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R*0.18, -Math.PI/2, -Math.PI/2 + (1 - G.cool/FIRE_COOLDOWN) * Math.PI*2); ctx.stroke(); }
    drawHitMarker(cx, cy);
    drawIndicators(true, cx, cy, R); drawPackIndicators(true, cx, cy, R);
  } else {
    ctx.save();
    ctx.translate(shx, shy); ctx.scale(SC, SC); ctx.translate(-cam.x, -cam.y);
    drawWorld(t, false);
    ctx.restore();
    if (running && G){
      var sx = (cross.x - cam.x) * SC, sy = (cross.y - cam.y) * SC;
      drawCrosshair(sx, sy);
      drawHitMarker(sx, sy);
      drawIndicators(false); drawPackIndicators(false);
    }
  }
  if (G && running){
    if (G.hurt > 0){
      var a = Math.min(1, G.hurt / 0.6) * 0.55;
      var vg = ctx.createRadialGradient(SW/2, SH/2, Math.min(SW,SH)*0.25, SW/2, SH/2, Math.max(SW,SH)*0.7);
      vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, 'rgba(200,0,0,' + a + ')');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, SW, SH);
    }
    if (G.healFx > 0){
      var ha = (G.healFx / 0.6) * 0.45;
      var hg = ctx.createRadialGradient(SW/2, SH/2, Math.min(SW,SH)*0.3, SW/2, SH/2, Math.max(SW,SH)*0.7);
      hg.addColorStop(0, 'rgba(61,220,132,0)'); hg.addColorStop(1, 'rgba(61,220,132,' + ha + ')');
      ctx.fillStyle = hg; ctx.fillRect(0, 0, SW, SH);
    }
    if (G.hp <= 30 && G.hp > 0){
      var p = 0.12 + 0.1*Math.sin(G.t*6);
      ctx.strokeStyle = 'rgba(255,40,40,' + p + ')'; ctx.lineWidth = 18; ctx.strokeRect(0, 0, SW, SH);
    }
    drawFloatsScreen();
  }
}

function drawWorld(t, inScope){
  // sky
  var sky = ctx.createLinearGradient(0, 0, 0, 700);
  sky.addColorStop(0, '#0b1230'); sky.addColorStop(0.45, '#2a2350'); sky.addColorStop(0.8, '#a2486a'); sky.addColorStop(1, '#f08a5d');
  ctx.fillStyle = sky; ctx.fillRect(-200, -200, WW + 400, WH + 400);
  stars.forEach(function(s){ ctx.globalAlpha = 0.35 + 0.35*Math.sin(t*1.5 + s.t); ctx.fillStyle = '#fff'; ctx.fillRect(s.x, s.y, s.r, s.r); });
  ctx.globalAlpha = 1;
  // moon
  ctx.fillStyle = 'rgba(255,240,215,.9)'; ctx.beginPath(); ctx.arc(1520, 150, 46, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,215,.08)'; ctx.beginPath(); ctx.arc(1520, 150, 90, 0, Math.PI*2); ctx.fill();
  // far skyline
  ctx.fillStyle = '#2b2445';
  far.forEach(function(b){ ctx.fillRect(b.x, b.top, b.w, 900 - b.top); });
  ctx.fillStyle = 'rgba(255,200,120,.18)';
  far.forEach(function(b, i){ for (var y = b.top + 14; y < 860; y += 22) for (var x = b.x + 8; x < b.x + b.w - 8; x += 16) if (((x*7 + y*3 + i) % 11) < 2) ctx.fillRect(x, y, 6, 8); });
  // haze
  var hz = ctx.createLinearGradient(0, 500, 0, 900); hz.addColorStop(0, 'rgba(240,138,93,0)'); hz.addColorStop(1, 'rgba(240,138,93,.18)');
  ctx.fillStyle = hz; ctx.fillRect(0, 500, WW, 400);
  // mid buildings with enemies
  mid.forEach(function(b){
    drawBuilding(b, t);
    if (G) G.enemies.forEach(function(e){ if (e.sp.b === b.id) drawEnemy(e, t); });
    if (G) G.packs.forEach(function(p){ if (p.b === b.id && p.state !== 'fall') drawPack(p, t); });
  });
  if (G) G.packs.forEach(function(p){ if (p.state === 'fall') drawPack(p, t); });
  // street glow between
  ctx.fillStyle = '#0b0d16'; ctx.fillRect(-200, 880, WW + 400, 40);
  // our parapet (foreground)
  var pg = ctx.createLinearGradient(0, 900, 0, 1000); pg.addColorStop(0, '#3a3f4b'); pg.addColorStop(1, '#1b1e26');
  ctx.fillStyle = pg; ctx.fillRect(-200, 900, WW + 400, 120);
  ctx.fillStyle = '#4b5160'; ctx.fillRect(-200, 896, WW + 400, 10);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  for (var x = -200; x < WW + 200; x += 70) ctx.fillRect(x, 906, 2, 94);
  // fx
  if (G){
    G.fx.forEach(function(f){
      var k = f.t / 0.8;
      if (f.type === 'puff'){ ctx.fillStyle = 'rgba(200,30,30,' + (0.8*(1-k)) + ')'; ctx.beginPath(); ctx.arc(f.x, f.y, (4 + k*14) * f.s, 0, Math.PI*2); ctx.fill(); }
      else if (f.type === 'dust'){ ctx.fillStyle = 'rgba(220,210,190,' + (0.7*(1-k)) + ')'; ctx.beginPath(); ctx.arc(f.x, f.y, 2 + k*10, 0, Math.PI*2); ctx.fill(); }
      else if (f.type === 'spark'){ ctx.strokeStyle = 'rgba(255,220,120,' + (1-k) + ')'; ctx.lineWidth = 2; for (var i = 0; i < 6; i++){ var a = -Math.PI*(0.1 + i*0.16); ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(a)*(8 + k*30), f.y + Math.sin(a)*(8 + k*30)); ctx.stroke(); } }
    });
    G.floats.forEach(function(f){
      var k = f.t / 1.2; ctx.globalAlpha = 1 - k*k;
      ctx.font = '700 ' + (f.small ? 16 : 22) + 'px Oswald, Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(f.txt, f.x, f.y - k*40);
      ctx.fillStyle = f.color; ctx.fillText(f.txt, f.x, f.y - k*40);
      ctx.globalAlpha = 1;
    });
  }
}
function drawFloatsScreen(){}

function drawBuilding(b, t){
  var base = 'hsl(' + b.hue + ',22%,' + b.light + '%)';
  ctx.fillStyle = base; ctx.fillRect(b.x, b.top, b.w, 900 - b.top);
  // side shade
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(b.x + b.w - 14, b.top, 14, 900 - b.top);
  // roof ledge
  ctx.fillStyle = 'hsl(' + b.hue + ',18%,' + (b.light + 9) + '%)'; ctx.fillRect(b.x - 5, b.top - 6, b.w + 10, 9);
  // rooftop props (behind enemies -> drawn before)
  var rt = b.rooftop;
  if (rt.tank){ ctx.fillStyle = '#1e2230'; ctx.fillRect(rt.tankx - 18, b.top - 70, 36, 50); ctx.fillRect(rt.tankx - 20, b.top - 74, 40, 8); ctx.fillRect(rt.tankx - 14, b.top - 20, 4, 20); ctx.fillRect(rt.tankx + 10, b.top - 20, 4, 20); }
  if (rt.ant){ ctx.strokeStyle = '#1e2230'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(b.x + b.w - 30, b.top); ctx.lineTo(b.x + b.w - 30, b.top - 90); ctx.stroke();
    ctx.fillStyle = (Math.sin(t*3 + b.id) > 0) ? '#ff3b30' : '#5a1512'; ctx.beginPath(); ctx.arc(b.x + b.w - 30, b.top - 92, 3.5, 0, Math.PI*2); ctx.fill(); }
  // windows
  b.win.forEach(function(w){
    if (w.lit){ ctx.fillStyle = w.warm ? 'rgba(255,205,120,.85)' : 'rgba(170,210,255,.75)'; }
    else ctx.fillStyle = 'rgba(8,10,18,.75)';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(w.x, w.y, w.w, 3);
  });
  if (rt.ac){ ctx.fillStyle = '#272c3b'; ctx.fillRect(rt.acx - 22, b.top - 18, 44, 18); ctx.fillStyle = '#1a1e2a'; ctx.beginPath(); ctx.arc(rt.acx, b.top - 9, 6, 0, Math.PI*2); ctx.fill(); }
}

function drawEnemy(e, t){
  var g = enemyGeom(e), s = g.s;
  ctx.save();
  // clip to visible area (above cover; inside window if window)
  ctx.beginPath();
  if (e.sp.type === 'win'){ var w = e.sp.win; ctx.rect(w.x, w.y, w.w, w.h); }
  else ctx.rect(e.sp.x - 80*s, e.sp.y - 200*s, 160*s, 200*s);
  ctx.clip();
  if (e.dead){
    var k = Math.min(1, e.fall / 0.6);
    ctx.globalAlpha = 1 - Math.max(0, (e.fall - 0.8) / 0.6);
    ctx.translate(g.x, g.y); ctx.rotate(-e.face * k * 1.2); ctx.translate(0, k * 40*s); ctx.translate(-g.x, -g.y);
  }
  var face = e.face;
  var body = '#11131a', gear = '#2b3326';
  // torso
  ctx.fillStyle = gear; roundRect(g.bodyL, g.bodyT, 26*s, 52*s, 6*s); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(g.bodyL, g.bodyT + 22*s, 26*s, 5*s);
  // head + helmet
  ctx.fillStyle = '#c99b78'; ctx.beginPath(); ctx.arc(g.headX, g.headY, g.headR*0.92, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = gear; ctx.beginPath(); ctx.arc(g.headX, g.headY - 2*s, g.headR*1.05, Math.PI*1.02, Math.PI*1.98); ctx.fill();
  ctx.fillRect(g.headX - g.headR*1.15, g.headY - 3*s, g.headR*2.3, 3*s);
  // balaclava/visor
  ctx.fillStyle = body; ctx.fillRect(g.headX - g.headR*0.9, g.headY + 1*s, g.headR*1.8, g.headR*0.75);
  // rifle (aimed toward the player = toward viewer, drawn as foreshortened)
  var rx = g.x + face*4*s, ry = g.bodyT + 14*s;
  ctx.fillStyle = '#0a0b10';
  ctx.fillRect(rx - 3*s, ry - 4*s, 22*s*face, 7*s);
  ctx.fillRect(rx + 2*s*face, ry - 9*s, 12*s*face, 5*s); // scope
  ctx.fillStyle = gear; ctx.fillRect(g.x - face*14*s, ry - 3*s, 18*s*face, 8*s); // arm
  // scope glint while aiming
  if (!e.dead && e.state === 'aim'){
    var prog = e.t / e.aimT, glow = 0.4 + 0.6*Math.abs(Math.sin(t*(4 + prog*14)));
    var gx = rx + 14*s*face, gy = ry - 7*s;
    ctx.restore(); ctx.save();
    ctx.fillStyle = 'rgba(255,' + Math.round(200 - prog*170) + ',' + Math.round(140 - prog*120) + ',' + glow + ')';
    ctx.beginPath(); ctx.arc(gx, gy, (2.2 + prog*2.5)*s, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,90,70,' + (0.35*glow) + ')'; ctx.lineWidth = 1.2*s;
    ctx.beginPath(); ctx.moveTo(gx - 9*s*glow, gy); ctx.lineTo(gx + 9*s*glow, gy); ctx.moveTo(gx, gy - 9*s*glow); ctx.lineTo(gx, gy + 9*s*glow); ctx.stroke();
    // aim timer arc
    ctx.strokeStyle = 'rgba(255,70,60,.95)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(g.headX, g.headY - 26*s, 7*s + 3, -Math.PI/2, -Math.PI/2 + prog*Math.PI*2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(g.headX, g.headY - 26*s, 7*s + 3, 0, Math.PI*2); ctx.stroke();
  }
  if (e.flash > 0){
    var fx = rx + 22*s*face, fy = ry;
    ctx.fillStyle = 'rgba(255,230,140,.95)'; ctx.beginPath(); ctx.arc(fx, fy, 9*s, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,140,40,.6)'; ctx.beginPath(); ctx.arc(fx, fy, 16*s, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function roundRect(x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function drawCrosshair(x, y){
  var gap = 7, len = 12, spread = 16 * SC;
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4;
  line4(x, y, gap, len); ctx.strokeStyle = G && G.cool > 0 ? 'rgba(255,212,90,.9)' : '#fff'; ctx.lineWidth = 2; line4(x, y, gap, len);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, Math.max(10, spread), 0, Math.PI*2); ctx.stroke();
  ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI*2); ctx.fill();
}
function line4(x, y, g, l){ ctx.beginPath(); ctx.moveTo(x - g - l, y); ctx.lineTo(x - g, y); ctx.moveTo(x + g, y); ctx.lineTo(x + g + l, y); ctx.moveTo(x, y - g - l); ctx.lineTo(x, y - g); ctx.moveTo(x, y + g); ctx.lineTo(x, y + g + l); ctx.stroke(); }
function drawHitMarker(x, y){
  if (!G || !G.hitMarker) return;
  var k = G.hitMarker.t / 0.35, c = G.hitMarker.head ? '255,212,90' : '255,255,255';
  ctx.strokeStyle = 'rgba(' + c + ',' + k + ')'; ctx.lineWidth = 3;
  var a = 10, b = 20;
  ctx.beginPath(); ctx.moveTo(x - a, y - a); ctx.lineTo(x - b, y - b); ctx.moveTo(x + a, y - a); ctx.lineTo(x + b, y - b);
  ctx.moveTo(x - a, y + a); ctx.lineTo(x - b, y + b); ctx.moveTo(x + a, y + a); ctx.lineTo(x + b, y + b); ctx.stroke();
}
// arrows pointing at off-screen (or out-of-scope) enemies
function drawIndicators(scope, cx, cy, R){
  if (!G) return;
  G.enemies.forEach(function(e){
    if (e.dead || e.rise < 0.5) return;
    var g = enemyGeom(e), urgent = e.state === 'aim' ? e.t / e.aimT : 0;
    var col = 'rgba(255,' + Math.round(200 - urgent*170) + ',' + Math.round(80 - urgent*60) + ',.95)';
    if (scope){
      var dx = g.headX - cross.x, dy = g.headY - cross.y, d = Math.sqrt(dx*dx + dy*dy) * SC * ZOOM;
      if (d < R*0.95) return;
      var ang = Math.atan2(dy, dx); arrow(cx + Math.cos(ang)*(R + 16), cy + Math.sin(ang)*(R + 16), ang, col, urgent);
    } else {
      var sx = (g.headX - cam.x) * SC, sy = (g.headY - cam.y) * SC, m = 26;
      if (sx > m && sx < SW - m && sy > 70 && sy < SH - m) return;
      var ax = Math.max(m, Math.min(SW - m, sx)), ay = Math.max(80, Math.min(SH - m, sy));
      arrow(ax, ay, Math.atan2(sy - SH/2, sx - SW/2), col, urgent);
    }
  });
}
function drawPackIndicators(scope, cx, cy, R){
  if (!G) return;
  G.packs.forEach(function(p){
    if (p.state === 'taken') return;
    var py = p.y - 11 * p.s;
    if (scope){
      var dx = p.x - cross.x, dy = py - cross.y, d = Math.sqrt(dx*dx + dy*dy) * SC * ZOOM;
      if (d < R*0.95) return;
      var ang = Math.atan2(dy, dx); plus(cx + Math.cos(ang)*(R + 34), cy + Math.sin(ang)*(R + 34));
      arrow(cx + Math.cos(ang)*(R + 14), cy + Math.sin(ang)*(R + 14), ang, 'rgba(61,220,132,.95)', 0);
    } else {
      var sx = (p.x - cam.x) * SC, sy = (py - cam.y) * SC, m = 30;
      if (sx > m && sx < SW - m && sy > 70 && sy < SH - m) return;
      var ax = Math.max(m, Math.min(SW - m, sx)), ay = Math.max(90, Math.min(SH - m, sy)), ang2 = Math.atan2(sy - SH/2, sx - SW/2);
      arrow(ax, ay, ang2, 'rgba(61,220,132,.95)', 0); plus(ax - Math.cos(ang2)*20, ay - Math.sin(ang2)*20);
    }
  });
}
function plus(x, y){ ctx.fillStyle = '#3ddc84'; ctx.fillRect(x - 2, y - 7, 4, 14); ctx.fillRect(x - 7, y - 2, 14, 4); }
function arrow(x, y, ang, col, urgent){
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  var s = 1 + urgent*0.4 + (urgent > 0.7 ? 0.15*Math.sin(G.t*20) : 0);
  ctx.scale(s, s);
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore();
}

// ---------- input ----------
var drag = null;
cv.addEventListener('contextmenu', function(e){ e.preventDefault(); });
cv.addEventListener('pointerdown', function(e){
  ensureAudio();
  if (!running || paused) return;
  if (e.pointerType === 'mouse'){
    if (e.button === 2){ toggleScope(); return; }
    if (e.button === 0) shoot();
  } else {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { cv.setPointerCapture(e.pointerId); } catch(err){}
  }
});
cv.addEventListener('pointermove', function(e){
  if (e.pointerType === 'mouse'){
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    if (!running || paused) return;
    if (scoped){
      // in scope, mouse movement is finer (relative)
      cross.x += (e.movementX || 0) / (SC * ZOOM) * 1.2; cross.y += (e.movementY || 0) / (SC * ZOOM) * 1.2;
    } else { cross.x = cam.x + e.clientX / SC; cross.y = cam.y + e.clientY / SC; }
    clampCross();
  } else if (drag && e.pointerId === drag.id){
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    var sens = scoped ? 1 / (SC * ZOOM) * 1.15 : 1.35 / SC;
    cross.x += dx * sens; cross.y += dy * sens; clampCross();
  }
});
function endDrag(e){ if (drag && e.pointerId === drag.id) drag = null; }
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
cv.addEventListener('pointerleave', function(e){ if (e.pointerType === 'mouse') mouse.inside = false; });
cv.addEventListener('wheel', function(e){ if (!running || paused) return; e.preventDefault(); if ((e.deltaY < 0) !== scoped) toggleScope(); }, { passive: false });
window.addEventListener('keydown', function(e){
  if (!running) return;
  if (e.code === 'Space' || e.code === 'KeyS' || e.code === 'ShiftLeft'){ e.preventDefault(); if (!paused) toggleScope(); }
  else if (e.code === 'KeyF' || e.code === 'Enter'){ shoot(); }
  else if (e.code === 'Escape' || e.code === 'KeyP'){ togglePause(); }
  else if (!paused && /^Arrow/.test(e.code)){ var st = scoped ? 6 : 20; if (e.code === 'ArrowLeft') cross.x -= st; if (e.code === 'ArrowRight') cross.x += st; if (e.code === 'ArrowUp') cross.y -= st; if (e.code === 'ArrowDown') cross.y += st; clampCross(); }
});
function bindBtn(el, fn){ el.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); ensureAudio(); fn(); }); }
bindBtn(document.getElementById('fireBtn'), shoot);
bindBtn(document.getElementById('scopeBtn'), function(){ toggleScope(); });
function toggleScope(){ if (!running || paused) return; scoped = !scoped; updateScopeBtn(); sfx('scope'); }
function updateScopeBtn(){ document.getElementById('scopeBtn').classList.toggle('on', scoped); }
document.getElementById('pauseBtn').addEventListener('click', togglePause);
document.getElementById('muteBtn').addEventListener('click', function(){ muted = !muted; this.textContent = muted ? '🔇' : '🔊'; });
function togglePause(){
  if (!running || !G || G.over) return;
  paused = !paused; show('pause', paused);
  if (paused) document.getElementById('pauseInfo').textContent = 'Score ' + G.score + ' · ' + G.kills + ' kills · Health ' + G.hp;
}
document.getElementById('resumeBtn').addEventListener('click', togglePause);
document.getElementById('quitBtn').addEventListener('click', function(){ paused = false; running = false; scoped = false; toMenu(); });
document.addEventListener('visibilitychange', function(){ if (document.hidden && running && G && !G.over && !paused) togglePause(); });

// ---------- screens ----------
function show(id, on){ document.getElementById(id).hidden = !on; }
function toMenu(){
  show('pause', false); show('over', false); show('hud', false); show('ctrls', false); show('hint', false); show('menu', true);
  var d = document.getElementById('diffs'); d.innerHTML = '';
  Object.keys(DIFFS).forEach(function(k){
    var D = DIFFS[k], b = document.createElement('button'); b.className = 'diff';
    b.innerHTML = '<span class="dot" style="background:' + D.color + ';box-shadow:0 0 12px ' + D.color + '"></span><span><b>' + D.name + '</b><small>' + D.desc + ' · ' + D.dmg + ' damage per hit · health pack +' + D.heal + '</small></span>' +
      '<span class="best">Best<strong>' + (best[k] || 0) + '</strong></span>';
    b.onclick = function(){ ensureAudio(); newGame(k); };
    d.appendChild(b);
  });
  document.getElementById('how').innerHTML = (isTouch
    ? '<b>Aim:</b> drag anywhere on the screen. <b>Zoom:</b> SCOPE button. <b>Shoot:</b> FIRE button.'
    : '<b>Aim:</b> mouse (push it to the screen edge to pan). <b>Zoom:</b> right-click, Space or mouse wheel. <b>Shoot:</b> left-click or F. <b>Pause:</b> Esc.') +
    '<br><b>Scoring:</b> body shot +5, headshot +10. Bullets are unlimited.<br><b>Health packs:</b> crates with a red cross parachute onto rooftops now and then (green arrows point to them). Shoot one to get health back: +30 on Easy, +25 on Medium, +20 on Hard. Be quick, because it vanishes after a few seconds.<br><b>Watch out:</b> a glinting scope and red ring mean that enemy is about to fire. They hit about 40% of the time. Red arrows point to enemies off-screen. Shooting without the scope is less accurate.';
}
function endGame(){
  G.over = true; running = false; scoped = false; updateScopeBtn();
  var nb = G.score > (best[G.key] || 0);
  if (nb){ best[G.key] = G.score; saveBest(); }
  setTimeout(function(){
    show('hud', false); show('ctrls', false); show('over', true);
    document.getElementById('ovDiff').textContent = G.D.name;
    document.getElementById('ovScore').textContent = G.score;
    document.getElementById('ovBest').textContent = nb && G.score > 0 ? '★ NEW BEST SCORE ★' : 'Best: ' + (best[G.key] || 0);
    document.getElementById('ovKills').textContent = G.kills;
    document.getElementById('ovHeads').textContent = G.heads;
    document.getElementById('ovAcc').textContent = G.shots ? Math.round(100 * G.hits / G.shots) + '%' : '–';
    var s = Math.floor(G.t); document.getElementById('ovTime').textContent = Math.floor(s/60) + ':' + ('0' + s%60).slice(-2);
  }, 900);
}
document.getElementById('againBtn').addEventListener('click', function(){ newGame(G.key); });
document.getElementById('menuBtn').addEventListener('click', toMenu);
function updateHud(){
  if (!G) return;
  document.getElementById('score').textContent = G.score;
  document.getElementById('kills').textContent = G.kills + ' kill' + (G.kills === 1 ? '' : 's');
  document.getElementById('heads').textContent = G.heads + ' HS';
  document.getElementById('acc').textContent = G.shots ? Math.round(100*G.hits/G.shots) + '% acc' : '–% acc';
  document.getElementById('hpLbl').textContent = 'Health ' + G.hp;
  var hb = document.getElementById('hpBar'); hb.style.width = G.hp + '%';
  hb.style.background = G.hp > 60 ? 'linear-gradient(90deg,#3ddc84,#a6f36a)' : G.hp > 30 ? 'linear-gradient(90deg,#ffb347,#ffd45a)' : 'linear-gradient(90deg,#ff3b30,#ff7a5a)';
  document.getElementById('lvlLbl').textContent = G.D.name + ' · ∞ ammo';
}

// ---------- audio ----------
var AC = null, noiseBuf = null;
function ensureAudio(){
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(function(){}); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 1.2, AC.sampleRate);
    var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;
  } catch(e){ AC = null; }
}
function sfx(kind, s){
  if (!AC || muted) return;
  try {
    var t = AC.currentTime, g = AC.createGain(); g.connect(AC.destination);
    if (kind === 'shot' || kind === 'enemy' || kind === 'ric'){
      var n = AC.createBufferSource(); n.buffer = noiseBuf;
      var f = AC.createBiquadFilter(); f.type = 'lowpass';
      var vol = kind === 'shot' ? 0.9 : kind === 'enemy' ? 0.25 : 0.18, dur = kind === 'shot' ? 0.5 : kind === 'enemy' ? 0.7 : 0.25;
      f.frequency.setValueAtTime(kind === 'shot' ? 2600 : kind === 'enemy' ? 900 : 4000, t); f.frequency.exponentialRampToValueAtTime(120, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      n.connect(f); f.connect(g); n.start(t, Math.random()*0.5); n.stop(t + dur);
      if (kind === 'shot'){ var o = AC.createOscillator(), og = AC.createGain(); o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25); og.gain.setValueAtTime(0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(og); og.connect(AC.destination); o.start(t); o.stop(t + 0.3); }
      if (kind === 'ric'){ var o2 = AC.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(2400, t); o2.frequency.exponentialRampToValueAtTime(700, t + 0.35); var g2 = AC.createGain(); g2.gain.setValueAtTime(0.08, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o2.connect(g2); g2.connect(AC.destination); o2.start(t); o2.stop(t + 0.35); }
    } else {
      var o3 = AC.createOscillator(); o3.connect(g);
      var map = { pack: [520, 0.06, 0.25, 'sine'], heal: [660, 0.12, 0.45, 'triangle'], hit: [880, 0.08, 0.12, 'square'], head: [1320, 0.1, 0.25, 'triangle'], hurt: [140, 0.25, 0.3, 'sawtooth'], scope: [600, 0.04, 0.05, 'sine'] }[kind] || [440, 0.05, 0.1, 'sine'];
      o3.type = map[3]; o3.frequency.setValueAtTime(map[0], t);
      if (kind === 'head') o3.frequency.setValueAtTime(map[0]*1.5, t + 0.08);
      if (kind === 'heal'){ o3.frequency.setValueAtTime(map[0]*1.25, t + 0.12); o3.frequency.setValueAtTime(map[0]*1.5, t + 0.24); }
      if (kind === 'hurt') o3.frequency.exponentialRampToValueAtTime(60, t + map[2]);
      g.gain.setValueAtTime(map[1], t); g.gain.exponentialRampToValueAtTime(0.001, t + map[2]);
      o3.start(t); o3.stop(t + map[2]);
    }
  } catch(e){}
}

// ---------- boot ----------
resize(); toMenu(); requestAnimationFrame(frame);
})();
