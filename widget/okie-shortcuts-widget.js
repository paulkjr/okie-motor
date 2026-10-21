// Okie Motor: Shortcuts widget for the iPhone (Scriptable, free in the App Store).
//
// The bed light and the three light modes of the dashboard (Cozy lights, Let's go to sleep, Turn up the lights) as four round buttons in the look of the thermostat, weather and feed
// widgets (warm smoky glass, the card's fonts and icons, the colours of the light modes). Every button is its own tap: it does its job and says so with a banner and a sound.
//
// A tap on a Scriptable widget opens Scriptable for a second, the script runs and a banner appears (an iOS widget cannot press anything silently: only an app's own widgets can).
// The medium and large widgets have four taps; a small widget has one, so it shows only the first button (the bed light).
//
// Set up once: it uses the same address and token as the thermostat widget (kept in the iPhone's Keychain); if you have not set that one up, run this script inside Scriptable and it
// asks for them. Then add a Scriptable widget (small, medium or large) and choose this script. Change the buttons in TILES below.
//
// Licence: GPL-3.0-or-later, like the rest of the Okie Motor.

// ------------------------------------------------------------------ settings ----
const DEFAULTS = { url: 'https://your-home-assistant.example' };
// kind 'switch': a button that toggles a switch or a light (it shows on or off; when it is on the button is white with a lit amber icon, like an active tile of the dashboard); kind 'script': runs a script or a scene.
// The buttons are dark glass circles: the light modes with an icon in their own colour (c0), the bed light with the wall tablet's light grey icon. c1 is the darker end of the mode's colour (not drawn now).
const TILES = [
  { id: 'bed', name: 'bedLight', icon: 'bulb3', kind: 'switch', entity: 'switch.bedlight', c0: '#ffd36a', c1: '#f5a30b' },
  { id: 'cozy', name: 'Cozy lights', icon: 'flame', kind: 'script', entity: 'script.govee_cozy_lights', c0: '#ff8a5c', c1: '#c8423f' },
  { id: 'sleep', name: "Let's go to sleep", icon: 'moon', kind: 'script', entity: 'script.govee_lets_go_to_sleep', c0: '#7c7cff', c1: '#2f2f8f' },
  { id: 'bright', name: 'Turn up the lights', icon: 'sun', kind: 'script', entity: 'script.govee_turn_up_the_lights', c0: '#f5a30b', c1: '#b4560a' },
];

// ------------------------------------------------------- pure part (tested) ----
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function hexRgb(hx) { const n = parseInt(String(hx).replace('#', ''), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
function mix(a, b, t) { return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) }; }

/**
 * Where the buttons are, in points: { rows, tiles: [{ i, x, y, w, h, cx, cy, d }], title: { x, y } }. A tile is the whole tappable box; (cx, cy, d) the round button inside it.
 * size: 'small' (one tile) | 'medium' (a row of four) | 'large' (two rows of two, bigger). W and H are the widget's size.
 */
function layout(W, H, size, n) {
  const out = { tiles: [], title: { x: 18, y: 12 } }, padX = 14;
  if (size === 'small') { const d = Math.min(W, H) * .42; out.rows = 1; out.tiles.push({ i: 0, x: 0, y: 0, w: W, h: H, cx: W / 2, cy: H * .4, d: d }); out.title = null; return out; }
  const cols = size === 'large' ? 2 : Math.min(4, Math.max(1, n)), rows = size === 'large' ? Math.ceil(Math.max(1, n) / 2) : 1;
  const top = size === 'large' ? 46 : 38, gap = size === 'large' ? 10 : 6, tw = (W - 2 * padX - (cols - 1) * gap) / cols, th = (H - top - 12 - (rows - 1) * gap) / rows;
  out.rows = rows;
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols), x = padX + c * (tw + gap), y = top + r * (th + gap), d = Math.min(tw * .78, th * (size === 'large' ? .52 : .56));
    out.tiles.push({ i: i, x: x, y: y, w: tw, h: th, cx: x + tw / 2, cy: y + d / 2 + th * .06, d: d });
  }
  return out;
}
/** The words under a button: its name and, for a switch, "On" / "Off" (or nothing when its state is unknown) */
function tileWords(tile, st, lang) {
  if (tile.kind !== 'switch') return { name: tile.name, sub: '' };
  const on = st && st.state === 'on', known = st && (st.state === 'on' || st.state === 'off');
  return { name: tile.name, sub: !known ? '' : (on ? (lang === 'de' ? 'An' : 'On') : (lang === 'de' ? 'Aus' : 'Off')) };
}
/** Is a switch tile lit (on) */
function isOn(st) { return !!st && st.state === 'on'; }
/** What a tap does: { domain, service, data }, from the tile and the current state of its entity */
function actionFor(tile, st) {
  const dom = String(tile.entity).split('.')[0];
  if (tile.kind === 'switch') return { domain: dom === 'light' ? 'light' : 'switch', service: isOn(st) ? 'turn_off' : 'turn_on', data: { entity_id: tile.entity } };
  return { domain: dom === 'scene' ? 'scene' : 'script', service: 'turn_on', data: { entity_id: tile.entity } };
}
/** The banner words after a tap: { title, body } */
function doneWords(tile, st, lang) {
  if (tile.kind === 'switch') return { title: tile.name + (isOn(st) ? ' off' : ' on') + ' ✓', body: '' };
  return { title: tile.name + ' ✓', body: '' };
}
const DOMAINS = { switch: 1, light: 1, script: 1, scene: 1 };

// ---- generated by tools/make-widget.py, do not edit (the card's own icons and the shape code of the weather screen) ----
const ICON_INNER = {"flame": "<path d=\"M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z\"/>", "moon": "<path d=\"M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z\"/>", "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>", "bulb": "<path d=\"M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z\"/>", "bulb3": "<path d=\"M12 2.4a6.4 6.4 0 0 0-3.9 11.5c.7.6 1.2 1.4 1.2 2.3v.5h5.4v-.5c0-.9.5-1.7 1.2-2.3A6.4 6.4 0 0 0 12 2.4z\" data-fill/><path d=\"M9.1 19h5.8M10 21.1h4M11 23h2\"/>"};
function shapesOf(inner) {
  var out = [], m, re = /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>|<path d="([^"]+)"\/>/g;
  while ((m = re.exec(inner))) out.push(m[4] != null ? { d: m[4] } : { circle: [+m[1], +m[2], +m[3]] });
  return out;
}
function arcToCurves(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
  if (!rx || !ry) return [['L', x2, y2]];
  var r = phi * Math.PI / 180, sinP = Math.sin(r), cosP = Math.cos(r), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  var x1p = cosP * dx + sinP * dy, y1p = -sinP * dx + cosP * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  var lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { var sq = Math.sqrt(lam); rx *= sq; ry *= sq; }
  var rx2 = rx * rx, ry2 = ry * ry, den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  var co = Math.sqrt(Math.max(0, (rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p) / den)) * (fa === fs ? -1 : 1);
  var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
  var cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2, cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
  var ang = function (ux, uy, vx, vy) { return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); };
  var th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry), dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
  var n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)), out = [];
  var X = function (u, v) { return cosP * rx * u - sinP * ry * v + cx; }, Y = function (u, v) { return sinP * rx * u + cosP * ry * v + cy; };
  for (var i = 0; i < n; i++) {
    var t1 = th1 + dth * i / n, t2 = th1 + dth * (i + 1) / n, a = 4 / 3 * Math.tan((t2 - t1) / 4);
    var e1 = [Math.cos(t1), Math.sin(t1)], e2 = [Math.cos(t2), Math.sin(t2)];
    var c1 = [e1[0] - a * e1[1], e1[1] + a * e1[0]], c2 = [e2[0] + a * e2[1], e2[1] - a * e2[0]];
    out.push(['C', X(c1[0], c1[1]), Y(c1[0], c1[1]), X(c2[0], c2[1]), Y(c2[0], c2[1]), i === n - 1 ? x2 : X(e2[0], e2[1]), i === n - 1 ? y2 : Y(e2[0], e2[1])]);
  }
  return out;
}
function parsePath(d) {
  var tok = String(d).match(/[MmLlHhVvCcAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [], i = 0, out = [], cmd = '', x = 0, y = 0, sx = 0, sy = 0;
  var num = function () { return parseFloat(tok[i++]); };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    var rel = cmd === cmd.toLowerCase(), c = cmd.toUpperCase();
    if (c === 'Z') { out.push(['Z']); x = sx; y = sy; continue; }
    if (c === 'M') { var mx = num(), my = num(); x = rel ? x + mx : mx; y = rel ? y + my : my; sx = x; sy = y; out.push(['M', x, y]); cmd = rel ? 'l' : 'L'; }
    else if (c === 'L') { var lx = num(), ly = num(); x = rel ? x + lx : lx; y = rel ? y + ly : ly; out.push(['L', x, y]); }
    else if (c === 'H') { var hx = num(); x = rel ? x + hx : hx; out.push(['L', x, y]); }
    else if (c === 'V') { var vy = num(); y = rel ? y + vy : vy; out.push(['L', x, y]); }
    else if (c === 'C') { var a1 = num(), b1 = num(), a2 = num(), b2 = num(), ex = num(), ey = num(); if (rel) { a1 += x; b1 += y; a2 += x; b2 += y; ex += x; ey += y; } out.push(['C', a1, b1, a2, b2, ex, ey]); x = ex; y = ey; }
    else if (c === 'A') { var rx = num(), ry = num(), ph = num(), fa = num(), fs = num(), ax = num(), ay = num(); if (rel) { ax += x; ay += y; } arcToCurves(x, y, rx, ry, ph, fa, fs, ax, ay).forEach(function (s) { out.push(s); }); x = ax; y = ay; }
    else break;
  }
  return out;
}
// ---- end generated ----

// ----------------------------------------------------------- Scriptable part ----
const KEY = { token: 'okie_ha_token', url: 'okie_ha_url', last: 'okie_shortcuts_last' };
function keep(k) { return Keychain.contains(k) ? Keychain.get(k) : null; }
function language() { try { return String(Device.language() || 'en').slice(0, 2) === 'de' ? 'de' : 'en'; } catch (e) { return 'en'; } }
function readConfig() { return { url: (keep(KEY.url) || DEFAULTS.url).replace(/\/+$/, ''), token: keep(KEY.token) }; }
async function ask(cfg) {
  const a = new Alert();
  a.title = 'Okie shortcuts widget';
  a.message = 'Your Home Assistant address and a long-lived access token (Home Assistant > your profile > Security > Long-lived access tokens). The token stays in this iPhone\'s Keychain; the thermostat widget uses the same one.';
  a.addTextField('https://your-home-assistant', cfg.url);
  a.addSecureTextField(cfg.token ? 'Token (leave empty to keep the saved one)' : 'Paste the token', '');
  a.addAction('Save'); a.addCancelAction('Cancel');
  if ((await a.presentAlert()) !== 0) return false;
  const url = a.textFieldValue(0).trim(), token = a.textFieldValue(1).trim();
  if (url) Keychain.set(KEY.url, url.replace(/\/+$/, ''));
  if (token) Keychain.set(KEY.token, token);
  return true;
}
async function api(cfg, path, body) {
  const r = new Request(cfg.url + path);
  r.headers = { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' };
  r.timeoutInterval = 15;
  if (body) { r.method = 'POST'; r.body = JSON.stringify(body); }
  return r.loadJSON();
}
/** The states of the switch tiles { entity_id: state object }, or the last ones seen (marked old) when Home Assistant cannot be reached. */
async function load(cfg) {
  const ids = TILES.filter(t => t.kind === 'switch').map(t => t.entity), out = {};
  try {
    for (const id of ids) { try { out[id] = await api(cfg, '/api/states/' + id); } catch (e) { out[id] = null; } }
    if (ids.length && ids.every(id => !out[id])) throw new Error('Home Assistant did not answer');
    Keychain.set(KEY.last, JSON.stringify({ st: out, at: Date.now() }));
    return { st: out, old: false };
  } catch (e) {
    const last = keep(KEY.last);
    if (last) { try { return { st: JSON.parse(last).st, old: true, error: String(e && e.message || e) }; } catch (x) { /* nothing usable */ } }
    return { st: out, old: true, error: String(e && e.message || e) };
  }
}

/** A tap on a button: answers at once, does the job, says what happened (a banner that is replaced, a sound). */
async function runTile(cfg, id) {
  const tile = TILES.filter(t => t.id === id)[0];
  const say = async (title, body, sound) => { const n = new Notification(); n.identifier = 'okie-shortcut'; n.title = title; n.body = body || ''; n.sound = sound || null; try { await n.schedule(); } catch (e) { /* no permission for banners */ } };
  if (!tile) return;
  await say(tile.name + ' ...', '');
  if (!cfg.token) { if (!(await ask(cfg))) return; cfg = readConfig(); }
  try {
    let st = null;
    if (tile.kind === 'switch') st = await api(cfg, '/api/states/' + tile.entity);
    const act = actionFor(tile, st);
    await api(cfg, '/api/services/' + act.domain + '/' + act.service, act.data);
    await say(doneWords(tile, st, language()).title, doneWords(tile, st, language()).body, 'piano_success');
  } catch (e) { await say('Could not do ' + tile.name, String(e && e.message || e).slice(0, 120), 'failure'); }
}

// ---- drawing ----
function col(c, a) { return new Color('#' + [c.r, c.g, c.b].map(v => ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2)).join(''), a == null ? 1 : a); }
const WHITE = { r: 255, g: 255, b: 255 };

/** The face: the glass of the other widgets, a title, and a round coloured button with the card's icon and the name under it for every tile.
 *  d = { tiles: [{ name, sub, on, c0, c1, icon }], dim } ; icon(ctx, name, cx, cy, size, color, lineWidth, fill) draws one of the card's icons (fill: the colour inside a closed shape, or null). */
function drawFace(ctx, W, H, size, d, icon) {
  const top = hexRgb('#5b4e44'), bottom = hexRgb('#3a322c'), strips = 64, L = layout(W, H, size, d.tiles.length), k = Math.min(W / 338, H / (size === 'large' ? 354 : 158)) * (size === 'small' ? 1.2 : 1);
  for (let i = 0; i < strips; i++) { ctx.setFillColor(col(mix(top, bottom, i / (strips - 1)))); ctx.fillRect(new Rect(0, Math.floor(i * H / strips), W, Math.ceil(H / strips) + 1)); }
  ctx.setTextAlignedLeft();
  if (L.title) { ctx.setFont(Font.boldSystemFont(17 * Math.max(.9, k))); ctx.setTextColor(col(WHITE, .92)); ctx.drawTextInRect('Shortcuts', new Rect(L.title.x, L.title.y, W - 36, 24)); }
  L.tiles.forEach(t => {
    const tl = d.tiles[t.i]; if (!tl) return;
    const lit = tl.on !== false;
    // the round button: dark smoky glass with a faint light rim (an image cannot blur what is behind it, so the glass is a soft dark fill with a lit edge and a brighter top).
    // The light modes keep their own colour in the icon (coral, violet, amber); the bed light has the wall tablet's light grey icon, and when it is on a white circle with a lit amber icon.
    const R = t.d / 2, lw = Math.max(1.4, t.d * .036), isBed = tl.kind === 'switch', on = isBed && lit, mode = hexRgb(tl.c0);
    if (on) { ctx.setFillColor(col(WHITE, .95)); ctx.fillEllipse(new Rect(t.cx - R, t.cy - R, t.d, t.d)); }
    else {
      ctx.setFillColor(col({ r: 20, g: 17, b: 15 }, .62)); ctx.fillEllipse(new Rect(t.cx - R, t.cy - R, t.d, t.d));
      ctx.setFillColor(col(WHITE, .05)); ctx.fillEllipse(new Rect(t.cx - R * .86, t.cy - R * .94, R * 1.72, R * .9));      // the brighter top of the glass
      ctx.setStrokeColor(col(WHITE, .16)); ctx.setLineWidth(1); ctx.strokeEllipse(new Rect(t.cx - R + .5, t.cy - R + .5, t.d - 1, t.d - 1));
    }
    if (on) icon(ctx, tl.icon, t.cx, t.cy, t.d * .5, col({ r: 245, g: 163, b: 11 }, 1), lw, col({ r: 245, g: 163, b: 11 }, .33));
    else if (isBed) icon(ctx, tl.icon, t.cx, t.cy, t.d * .5, col({ r: 214, g: 208, b: 201 }, lit ? .95 : .8), lw, null);
    else icon(ctx, tl.icon, t.cx, t.cy, t.d * .5, col(mode, 1), lw, null);
    // the words
    const fs = (size === 'large' ? 13 : 11) * Math.max(.92, k), ty = t.cy + t.d / 2 + 5 * Math.max(.9, k);
    ctx.setFont(Font.boldSystemFont(fs)); ctx.setTextColor(col(WHITE, .92)); ctx.setTextAlignedCenter();
    ctx.drawTextInRect(tl.name, new Rect(t.x - 2, ty, t.w + 4, fs * 2.5));
    if (tl.sub) { ctx.setFont(Font.semiboldSystemFont(fs * .92)); ctx.setTextColor(col(WHITE, .6)); ctx.drawTextInRect(tl.sub, new Rect(t.x, ty + fs * 1.25, t.w, fs * 1.4)); }
    ctx.setTextAlignedLeft();
  });
  if (d.dim) { ctx.setFont(Font.systemFont(11)); ctx.setTextColor(col(WHITE, .5)); ctx.drawTextInRect('Not reachable', new Rect(W - 100, 14, 86, 16)); }
}
// ---- the face in the card's fonts and icons, drawn on a canvas in a hidden web view (Scriptable's own drawing cannot use our fonts) ----
const CANVAS_STUBS = [
  'function Color(hex, a) { var n = parseInt(String(hex).replace("#", ""), 16); this.css = "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + (a == null ? 1 : a) + ")"; }',
  'function Point(x, y) { this.x = x; this.y = y; } function Size(w, h) { this.width = w; this.height = h; } function Rect(x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h; }',
  'function Font(size, weight, family) { this.size = size; this.weight = weight; this.family = family; }',
  'function Path() { this.ops = []; } Path.prototype.move = function (p) { this.ops.push(["m", p]); }; Path.prototype.addLine = function (p) { this.ops.push(["l", p]); }; Path.prototype.closeSubpath = function () { this.ops.push(["z"]); };',
  'Font.boldSystemFont = function (s) { return new Font(s, 800, "Okie Manrope"); }; Font.semiboldSystemFont = function (s) { return new Font(s, 700, "Okie Manrope"); }; Font.systemFont = function (s) { return new Font(s, 500, "Okie Manrope"); };',
  'function DrawContext(c) { this.c = c; this.align = "left"; }',
  'DrawContext.prototype.setFillColor = function (k) { this.c.fillStyle = k.css; }; DrawContext.prototype.setStrokeColor = function (k) { this.c.strokeStyle = k.css; };',
  'DrawContext.prototype.setLineWidth = function (n) { this.c.lineWidth = n; };',
  'DrawContext.prototype.fillRect = function (r) { this.c.fillRect(r.x, r.y, r.width, r.height); };',
  'DrawContext.prototype.strokeEllipse = function (r) { var c = this.c; c.beginPath(); c.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, 7); c.stroke(); };',
  'DrawContext.prototype.fillEllipse = function (r) { var c = this.c; c.beginPath(); c.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, 7); c.fill(); };',
  'DrawContext.prototype.addPath = function (p) { this.path = p; };',
  'DrawContext.prototype.fillPath = function () { var c = this.c; c.beginPath(); this.path.ops.forEach(function (o) { if (o[0] === "m") c.moveTo(o[1].x, o[1].y); else if (o[0] === "l") c.lineTo(o[1].x, o[1].y); else c.closePath(); }); c.fill(); };',
  'DrawContext.prototype.setFont = function (f) { this.font = f; }; DrawContext.prototype.setTextColor = function (k) { this.textCss = k.css; };',
  'DrawContext.prototype.setTextAlignedLeft = function () { this.align = "left"; }; DrawContext.prototype.setTextAlignedCenter = function () { this.align = "center"; };',
  // text in a rect wraps at the words, like Scriptable's own drawTextInRect
  'DrawContext.prototype.drawTextInRect = function (t, r) { var c = this.c, f = this.font; c.save(); c.beginPath(); c.rect(r.x, r.y, r.width, r.height); c.clip(); c.font = f.weight + " " + f.size + "px \\"" + f.family + "\\", -apple-system, sans-serif"; c.fillStyle = this.textCss; c.textBaseline = "top"; c.textAlign = this.align; var words = String(t).split(" "), lines = [], cur = ""; words.forEach(function (w) { var test = cur ? cur + " " + w : w; if (cur && c.measureText(test).width > r.width) { lines.push(cur); cur = w; } else cur = test; }); lines.push(cur); var x = this.align === "center" ? r.x + r.width / 2 : r.x; lines.forEach(function (ln, i) { c.fillText(ln, x, r.y + i * f.size * 1.18); }); c.restore(); };',
].join('\n');
// one of the card's icons (a 24 x 24 grid of circles and paths), drawn with Path2D into the canvas
const WEB_ICON = 'function webIcon(ctx, name, cx, cy, size, color, lw, fill) { var c = ctx.c, f = size / 24; c.save(); c.translate(cx - size / 2, cy - size / 2); c.scale(f, f); c.strokeStyle = color.css; c.lineWidth = lw / f; c.lineCap = "round"; c.lineJoin = "round"; (ICON_INNER[name] || "").replace(/<circle cx="([\\d.]+)" cy="([\\d.]+)" r="([\\d.]+)"\\/>|<path d="([^"]+)"( data-fill)?\\/>/g, function (m, x, y, r, d, fl) { if (d) { var p = new Path2D(d); if (fill && fl) { c.fillStyle = fill.css; c.fill(p); } c.stroke(p); } else { c.beginPath(); c.arc(+x, +y, +r, 0, 7); c.stroke(); } return m; }); c.restore(); }';

function webFaceHtml(W, H, scale, size, d) {
  const fns = [clamp, hexRgb, mix, col, layout, drawFace].map(f => f.toString()).join('\n');
  const run = [
    'var WHITE = ' + JSON.stringify(WHITE) + ', ICON_INNER = ' + JSON.stringify(ICON_INNER) + ';',
    CANVAS_STUBS, WEB_ICON, fns,
    'var D = ' + JSON.stringify(d) + ', SIZE = ' + JSON.stringify(size) + ', W = ' + W + ', H = ' + H + ', SC = ' + scale + ';',
    'var cv = document.getElementById("c"); cv.width = Math.round(W * SC); cv.height = Math.round(H * SC); var g2 = cv.getContext("2d"); g2.scale(SC, SC);',
    'window.__res = null; window.onerror = function (m) { if (!window.__res) window.__res = { err: "script: " + m }; };',
    // The fonts are handed to the page as data and loaded with the FontFace API: a web view nobody looks at does not lay out any text, so a font only declared in css would never be fetched.
    'function bin(s) { var t = atob(s), u = new Uint8Array(t.length); for (var i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); return u.buffer; }',
    'function getFont(name, data, weight) { var f = new FontFace(name, bin(data), { weight: weight, style: "normal" }); return f.load().then(function () { document.fonts.add(f); return f; }); }',
    'function finish() { try { drawFace(new DrawContext(g2), W, H, SIZE, D, webIcon); window.__res = { png: cv.toDataURL("image/png") }; } catch (e) { window.__res = { err: "draw: " + (e && e.message || e) }; } }',
    'window.__ready = getFont("Okie Manrope", ' + JSON.stringify(MANROPE_B64) + ', "500 800").then(finish, function (e) { window.__res = { err: "font: " + (e && e.message || e) }; });',
  ].join('\n');
  return '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;}</style></head><body><canvas id="c"></canvas><script>' + run.replace(/<\/script/g, '<\\/script') + '<\/script></body></html>';
}
/** A promise that fails after `ms`, and a way to stop it (Scriptable has no setTimeout: its own Timer does the same). */
function giveUpAfter(ms) {
  let stop = () => {};
  const promise = new Promise((res, rej) => {
    const f = () => rej(new Error('timeout after ' + Math.round(ms / 1000) + ' s'));
    if (typeof Timer !== 'undefined') { const t = Timer.schedule(ms, false, f); stop = () => { try { t.invalidate(); } catch (e) { /* done anyway */ } }; }
    else { const t = setTimeout(f, ms); stop = () => clearTimeout(t); }
  });
  return { promise, stop };
}
let FACE_ERROR = null;
/** The picture of the face with the card's fonts and icons: { image }, or { error } (a plainer picture with the iPhone fonts is used then). */
async function webFace(W, H, size, d) {
  try {
    let scale = 3; try { scale = Device.screenScale() || 3; } catch (e) { /* the usual */ }
    const wv = new WebView();
    await wv.loadHTML(webFaceHtml(W, H, scale, size, d));
    const limit = giveUpAfter(10000);      // (the script below ends in void 0: its last value must be something a web view can hand back, not a promise)
    let raw; try { raw = await Promise.race([wv.evaluateJavaScript('window.__ready.then(function () { completion(JSON.stringify(window.__res)); }); void 0;', true), limit.promise]); } finally { limit.stop(); }
    const r = JSON.parse(String(raw));
    if (!r || !r.png || !/^data:image\/png;base64,/.test(r.png)) return { error: (r && r.err) || 'no picture came back' };
    return { image: Image.fromData(Data.fromBase64String(r.png.split(',')[1])) };
  } catch (e) { return { error: String(e && e.message || e) }; }
}
/** The same icons drawn with Scriptable's own paths (the plainer picture when the web view cannot be used) */
function scIcon(ctx, name, cx, cy, size, color, lw, fill) {
  const f = size / 24, x0 = cx - size / 2, y0 = cy - size / 2; ctx.setStrokeColor(color); ctx.setLineWidth(lw);
  (ICON_INNER[name] || '').replace(/<path d="[^"]+" data-fill\/>/g, m => m.replace(' data-fill', ''));      // (the fill marker is only for the web picture)
  const marked = (ICON_INNER[name] || '').match(/<path d="[^"]+" data-fill\/>/g) || [];
  shapesOf((ICON_INNER[name] || '').replace(/ data-fill/g, '')).forEach(sh => {
    if (sh.circle) { ctx.strokeEllipse(new Rect(x0 + (sh.circle[0] - sh.circle[2]) * f, y0 + (sh.circle[1] - sh.circle[2]) * f, 2 * sh.circle[2] * f, 2 * sh.circle[2] * f)); return; }
    const P = (x, y) => new Point(x0 + x * f, y0 + y * f), p = new Path();
    parsePath(sh.d).forEach(sg => { if (sg[0] === 'M') p.move(P(sg[1], sg[2])); else if (sg[0] === 'L') p.addLine(P(sg[1], sg[2])); else if (sg[0] === 'C') p.addCurve(P(sg[5], sg[6]), P(sg[1], sg[2]), P(sg[3], sg[4])); else p.closeSubpath(); });
    if (fill && marked.some(m => m.indexOf(sh.d) >= 0)) { ctx.setFillColor(fill); ctx.addPath(p); ctx.fillPath(); ctx.setStrokeColor(color); ctx.setLineWidth(lw); }
    ctx.addPath(p); ctx.strokePath();
  });
}

/** The size of a widget in points on this iPhone (Apple's table, by the height of the screen): what the picture has to match to stay sharp. */
function widgetPt(size) {
  const sc = Device.screenSize(), h = Math.max(sc.width, sc.height);
  const T = { 932: [170, 364, 382], 926: [170, 364, 382], 896: [169, 360, 379], 852: [158, 338, 354], 844: [158, 338, 354], 812: [155, 329, 345], 736: [157, 348, 357], 667: [148, 321, 324], 568: [141, 292, 311] };
  const row = T[h] || (h > 900 ? [170, 364, 382] : [158, 338, 354]);
  return { w: size === 'small' ? row[0] : row[1], h: size === 'large' ? row[2] : row[0] };
}
function tapUrl(id) { return 'scriptable:///run?scriptName=' + encodeURIComponent(Script.name()) + '&tile=' + encodeURIComponent(id); }

async function makeWidget(states, family, old) {
  const w = new ListWidget(), lang = language();
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  if (String(family).indexOf('accessory') === 0) { w.addAccessoryWidgetBackground = true; const a = w.addText('Shortcuts'); a.font = Font.boldSystemFont(13); return w; }
  const size = family === 'small' ? 'small' : (family === 'large' || family === 'extraLarge' ? 'large' : 'medium'), pt = widgetPt(size), W = pt.w, H = pt.h;
  const tiles = (size === 'small' ? TILES.slice(0, 1) : TILES), L = layout(W, H, size, tiles.length);
  const data = { dim: false, tiles: tiles.map(t => { const st = states[t.entity], words = tileWords(t, st, lang); return { name: words.name, sub: words.sub, kind: t.kind, on: t.kind === 'switch' ? (st ? isOn(st) : true) : true, c0: t.c0, c1: t.c1, icon: t.icon }; }) };
  const shot = await webFace(W, H, size, data);
  FACE_ERROR = shot.error || null;
  const ctx = new DrawContext(); ctx.size = new Size(W, H); ctx.opaque = true; ctx.respectScreenScale = true;
  if (shot.image) ctx.drawImageInRect(shot.image, new Rect(0, 0, W, H));      // drawn once at the widget's size and the screen's scale: one picture pixel per screen pixel
  else { drawFace(ctx, W, H, size, data, scIcon); ctx.setFont(Font.systemFont(11)); ctx.setTextColor(col(WHITE, .45)); ctx.setTextAlignedLeft(); ctx.drawTextInRect('card fonts: ' + String(FACE_ERROR).slice(0, 70), new Rect(8, H - 15, W - 16, 13)); }
  if (old) { ctx.setFont(Font.systemFont(11)); ctx.setTextColor(col(WHITE, .55)); ctx.setTextAlignedLeft(); ctx.drawTextInRect('old', new Rect(W - 34, 8, 28, 14)); }
  w.backgroundImage = ctx.getImage();
  w.setPadding(0, 0, 0, 0);
  // the taps: one invisible box on every button (1 % black: a view with no colour at all does not take a tap, and 1 % of black over the dark glass cannot be seen, white was) (a small widget has a single tap for the whole widget)
  if (size === 'small') { w.url = tapUrl(tiles[0].id); return w; }
  w.url = null;
  const col0 = w.addStack(); col0.layoutVertically(); col0.size = new Size(W, H);
  let y = 0;
  const rows = {}; L.tiles.forEach(t => { const r = Math.round(t.y); (rows[r] = rows[r] || []).push(t); });
  Object.keys(rows).map(Number).sort((a, b) => a - b).forEach(r => {
    const list = rows[r]; col0.addSpacer(Math.max(0, r - y)); const hs = col0.addStack(); hs.layoutHorizontally(); hs.size = new Size(W, list[0].h);
    let x = 0; list.forEach(t => { hs.addSpacer(Math.max(0, t.x - x)); const box = hs.addStack(); box.size = new Size(t.w, t.h); box.backgroundColor = new Color('#000000', .01); box.url = tapUrl(tiles[t.i].id); x = t.x + t.w; });
    y = r + list[0].h;
  });
  return w;
}

async function main() {
  const cfg = readConfig();
  const family = (typeof config !== 'undefined' && config.widgetFamily) || 'medium';
  const q = (typeof args !== 'undefined' && args.queryParameters) || {};
  if (!config.runsInWidget && q.tile) { await runTile(cfg, String(q.tile)); Script.complete(); return; }       // a tap on a button: do the job
  if (!config.runsInWidget) {
    const m = new Alert(); m.title = 'Okie shortcuts widget'; m.message = cfg.token ? 'Run a button, set up again, or look at the widget.' : 'First time: set it up.';
    TILES.forEach(t => m.addAction(t.name)); m.addAction('Set up'); m.addAction('Preview medium'); m.addAction('Preview large'); m.addCancelAction('Close');
    const pick = await m.presentSheet(), n = TILES.length;
    if (pick >= 0 && pick < n) { await runTile(cfg, TILES[pick].id); Script.complete(); return; }
    if (pick === n) { if (await ask(cfg)) { const x = new Notification(); x.title = 'Saved'; x.body = 'Add a Scriptable widget and choose this script.'; await x.schedule(); } Script.complete(); return; }
    if (pick < n + 1) { Script.complete(); return; }
    const c2 = readConfig();
    if (!c2.token) { if (!(await ask(c2))) { Script.complete(); return; } }
    const got = await load(readConfig());
    const w = await makeWidget(got.st, pick === n + 1 ? 'medium' : 'large', got.old);
    if (FACE_ERROR) { const e = new Alert(); e.title = 'The card fonts could not be drawn'; e.message = FACE_ERROR + '\n\nThe widget uses the iPhone fonts until this works. Please send a screenshot of this message.'; e.addCancelAction('OK'); await e.presentAlert(); }
    if (pick === n + 1) await w.presentMedium(); else await w.presentLarge();
    Script.complete(); return;
  }
  if (!cfg.token) {
    const w = new ListWidget(); w.backgroundColor = new Color('#3a322c');
    const t = w.addText('Open Scriptable and run this script once to set it up'); t.textColor = Color.white(); t.font = Font.systemFont(13);
    Script.setWidget(w); Script.complete(); return;
  }
  const got = await load(cfg);
  Script.setWidget(await makeWidget(got.st, family, got.old));
  Script.complete();
}

// ---- generated by tools/make-widget.py, do not edit (the card's fonts as data) ----
const MANROPE_B64 = "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";
// ---- end generated ----

if (typeof Script !== 'undefined') await main();
else if (typeof module !== 'undefined') module.exports = { TILES, layout, tileWords, isOn, actionFor, doneWords, drawFace, ICON_INNER, shapesOf, parsePath };
