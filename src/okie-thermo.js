/* okie-thermo: the Thermo Dial (the user's own thermostat design, ../thermo-dial-project) as the Controls of a climate device.
 *
 * It sits under the video header of the detail view, on the glass of the panel (no background of its own):
 *   - a big wheel of ticks at the right turns while you drag, scroll or press the arrow keys; the glow arc and every accent follow a
 *     blue -> orange -> red gradient of the target temperature
 *   - the big number, the temperature now, "Set smart schedule", the mode buttons at the left
 *   - a power button that turns the thermostat off after a 3 second hold (a tap turns it back on)
 *   - a flick keeps coasting a few degrees and slows down like a real wheel
 *
 * Writes are debounced: one set_temperature 450 ms after the last movement. For 15 seconds after sending, the dial trusts the number you
 * sent over what Home Assistant still reports (a real thermostat reports the change back late), so it never snaps back and forth.
 *
 * The pure part (colour, rotation, snapping, coasting, the trust-your-own-number rule) is unit-tested; the DOM part is checked in the
 * browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // ---------------------------------------------------------- pure ----
  // How the dial looks, all of it adjustable (Settings tab of a thermostat > Dial look): the glow (a Figma drop shadow of the rim: blur, spread, strength in %), the tick density
  // in % (100 = 197 ticks around the circle) and the colour scale: four colours (coldest end, "cool" at the first limit, "warm" at the second limit, hottest end) and the two
  // limits in degrees Fahrenheit. The defaults are the Thermo Dial project's colours and the numbers of the Figma design.
  var DEFAULT_LOOK = { glowBlur: 80, glowSpread: 15, glowOpacity: 65, ticks: 100, c0: '#1446be', c1: '#2d82ff', c2: '#ff962d', c3: '#ff2d55', cool: 69, warm: 75 };
  var DEG_PER_F = 236 / 69;                              // how far the wheel turns for one degree Fahrenheit

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) }; }
  function toF(v, unit) { return unit === '°C' ? v * 9 / 5 + 32 : v; }
  function hexToRgb(hx) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hx == null ? '' : hx).trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(c) { return '#' + [c.r, c.g, c.b].map(function (v) { return ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2); }).join(''); }
  /** Whatever the settings hold, a look the dial can draw: numbers inside their range, colours as #rrggbb, the two limits in order. */
  function normalizeLook(l) {
    l = l || {};
    var d = DEFAULT_LOOK, out = {};
    function num(k, lo, hi) { var v = l[k] == null || l[k] === '' ? NaN : +l[k]; return isFinite(v) ? clamp(v, lo, hi) : d[k]; }
    out.glowBlur = num('glowBlur', 0, 200); out.glowSpread = num('glowSpread', 0, 60); out.glowOpacity = num('glowOpacity', 0, 100); out.ticks = num('ticks', 40, 160);
    ['c0', 'c1', 'c2', 'c3'].forEach(function (k) { var c = hexToRgb(l[k]); out[k] = c ? rgbToHex(c) : d[k]; });
    out.cool = num('cool', 40, 98); out.warm = num('warm', 41, 99);
    if (out.warm <= out.cool) out.warm = out.cool + 1;
    return out;
  }

  /** The accent colour of a target temperature: the coldest colour at the bottom of the range, the cool colour at the first limit (69°F), blending to the warm colour at the
   *  second limit (75°F), to the hottest colour at the top of the range. `look` is optional (the defaults are the Thermo Dial project's blue > orange > red). */
  function colorFor(value, min, max, unit, look) {
    var lk = normalizeLook(look), c0 = hexToRgb(lk.c0), c1 = hexToRgb(lk.c1), c2 = hexToRgb(lk.c2), c3 = hexToRgb(lk.c3);
    var v = toF(value, unit), lo = toF(min, unit), hi = toF(max, unit);
    var bo = clamp(lk.cool, lo, hi), br = clamp(lk.warm, lo, hi);
    if (br <= bo) br = bo + 1;
    if (v <= bo) return lerp(c0, c1, clamp((v - lo) / Math.max(1, bo - lo), 0, 1));
    if (v <= br) return lerp(c1, c2, (v - bo) / (br - bo));
    return lerp(c2, c3, clamp((v - br) / Math.max(1, hi - br), 0, 1));
  }
  /** Degrees the tick wheel is turned for a value (a Celsius degree is 1.8 Fahrenheit degrees, so it turns 1.8 times as far). */
  function rotationFor(value, min, unit) { return (value - min) * DEG_PER_F * (unit === '°C' ? 1.8 : 1); }
  /** A value on the thermostat's grid, inside its range. */
  function snapTo(v, min, max, step) {
    var s = step > 0 ? step : 1;
    return +clamp(Math.round(v / s) * s, min, max).toFixed(2);
  }
  /** What the big number says: whole degrees on a 1-degree thermostat, one decimal when it moves in halves. */
  function fmt(v, step, comma) {
    if (v == null || isNaN(v)) return '–';
    var s = step < 1 ? (Math.round(v * 10) / 10).toFixed(1) : String(Math.round(v));
    return comma ? s.replace('.', ',') : s;
  }
  /** The speed the finger leaves behind: a blend of the last speed and this move (degrees per millisecond); a pause resets it. */
  function nudgeVelocity(prev, delta, dtMs) { return (dtMs > 0 && dtMs < 200) ? prev * 0.45 + (delta / dtMs) * 0.55 : 0; }
  /** The speed the wheel keeps when the finger lifts: none when it rested for a moment first (a drag, a pause and a lift is not a flick). */
  function releaseVelocity(v, idleMs) { return idleMs > 90 ? 0 : v; }
  /** One frame of coasting: how far the value moves and how fast it is afterwards (exponential friction). */
  function coastStep(velocity, dtMs) {
    var dt = Math.min(48, Math.max(0, dtMs));
    return { delta: velocity * dt, velocity: velocity * Math.pow(0.0000033, dt / 1000) };
  }
  // The glow of the design (Figma): a drop shadow of the rim, default blur 80, spread 15, 65 % opacity. That is the 4 px rim thickened by the spread (to 34 px) and blurred with a
  // Gaussian of sigma = blur / 2 (40 px). Scene units: 1 unit = 2.113 px on the design's wheel, so sigma is 18.9 and the thickened rim is 16.1 wide by default.
  function erf(x) {
    var sg = x < 0 ? -1 : 1, ax = Math.abs(x), t = 1 / (1 + 0.3275911 * ax);
    return sg * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax));
  }
  function phi(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
  function glowShape(look) {
    var lk = normalizeLook(look), K = 2.113;
    return { sigma: Math.max(0.6, lk.glowBlur / 2 / K), half: (2 + lk.glowSpread) / K, alpha: lk.glowOpacity / 100 };
  }
  /** How bright the glow is, d scene units away from the rim (inside or outside): the strength x the blurred band. */
  function glowAlpha(d, look) { var gs = glowShape(look); return gs.alpha * (phi((d + gs.half) / gs.sigma) - phi((d - gs.half) / gs.sigma)); }
  /** How far from the rim the glow still shows (scene units): beyond this it is under 1 %. */
  function glowReach(look) { var gs = glowShape(look); return Math.ceil(gs.half + 3 * gs.sigma); }
  // ---- lights: the same wheel with percent instead of degrees, in the colour the light shines in, glowing as strong as it is bright ----
  var DEG_PER_PCT = 2.36;                                // 0..100 % turns the wheel through the same 236 degrees as the thermostat's whole range
  var WARM_WHITE = { r: 255, g: 167, b: 87 };            // a light that tells nothing about its colour: 2700 K
  /** The colour of a colour temperature (Tanner Helland's approximation), as { r, g, b }. */
  function kelvinToRgb(k) {
    var t = clamp(+k || 2700, 1000, 40000) / 100, r, gg, b;
    if (t <= 66) { r = 255; gg = 99.4708025861 * Math.log(t) - 161.1195681661; }
    else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); gg = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
    if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    function ch(v) { return clamp(Math.round(v), 0, 255); }
    return { r: ch(r), g: ch(gg), b: ch(b) };
  }
  /** The colour a light shines in, from its attributes: its colour temperature when it is in that mode, else its rgb colour, else warm white (or `fallback`, the last colour seen). */
  function lightRgb(a, fallback) {
    a = a || {};
    var kel = +a.color_temp_kelvin, mired = +a.color_temp, rgb = a.rgb_color;
    var okRgb = Array.isArray(rgb) && rgb.length >= 3 && rgb.slice(0, 3).every(function (v) { return isFinite(+v); });
    var kelvin = kel > 0 ? kel : (mired > 0 ? 1000000 / mired : 0);
    if (a.color_mode === 'color_temp' && kelvin) return kelvinToRgb(kelvin);
    if (okRgb) return { r: clamp(Math.round(+rgb[0]), 0, 255), g: clamp(Math.round(+rgb[1]), 0, 255), b: clamp(Math.round(+rgb[2]), 0, 255) };
    if (kelvin) return kelvinToRgb(kelvin);
    return fallback || WARM_WHITE;
  }
  /** How strong the glow around the rim is for a brightness in %: none when it is off, full at 100 (a little gentler in the middle, like a lamp seems to be). */
  function glowGain(pct) { var p = clamp(+pct || 0, 0, 100) / 100; return p <= 0 ? 0 : Math.pow(p, .8); }
  /** How many ticks go around the circle: 197 at 100 %. */
  function tickCount(look) { return Math.round(197 * normalizeLook(look).ticks / 100); }
  /** Which number to show while a value we sent may not have come back from the thermostat yet. */
  function resolveTarget(o) {
    var grace = o.grace == null ? 15000 : o.grace;
    if (o.pendingAt && o.now - o.pendingAt < grace) {
      if (o.server == null || Math.abs(o.server - o.pendingValue) > (o.tol == null ? 0.001 : o.tol)) return { value: o.pendingValue, pending: true };
      return { value: o.server, pending: false };      // the device caught up: stop overriding
    }
    return { value: o.server, pending: false };
  }

  var pureApi = { releaseVelocity: releaseVelocity, kelvinToRgb: kelvinToRgb, lightRgb: lightRgb, glowGain: glowGain, DEG_PER_PCT: DEG_PER_PCT, WARM_WHITE: WARM_WHITE, DEFAULT_LOOK: DEFAULT_LOOK, normalizeLook: normalizeLook, hexToRgb: hexToRgb, rgbToHex: rgbToHex, glowAlpha: glowAlpha, glowReach: glowReach, tickCount: tickCount, colorFor: colorFor, rotationFor: rotationFor, snapTo: snapTo, fmt: fmt, nudgeVelocity: nudgeVelocity, coastStep: coastStep, resolveTarget: resolveTarget, DEG_PER_F: DEG_PER_F };
  if (isNode) { module.exports = pureApi; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------ DOM ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;

  core.registerStrings('en', {
    'th.eyebrow': 'Temperature', 'th.now': 'Now', 'th.hold': 'Hold to turn off', 'th.off_note': 'Off. Tap the power icon to turn on', 'th.schedule': 'Set smart schedule',
    'th.unavailable': 'Not reachable right now', 'th.min': 'Min', 'th.max': 'Max', 'th.lower': 'Lower', 'th.raise': 'Raise',
    'th.st.cooling': 'Cooling', 'th.st.heating': 'Heating', 'th.st.idle': 'idle', 'th.st.off': 'Off', 'th.st.drying': 'Drying', 'th.st.fan': 'Fan',
    'th.light_off': 'Off. Drag the wheel or tap Turn on', 'th.turn_off': 'Turn off', 'th.turn_on': 'Turn on', 'th.light_sched': 'Set schedule', 'th.colors': 'Colours',
    'th.look': 'Dial look', 'th.glow': 'Glow', 'th.glow_blur': 'Glow blur', 'th.glow_spread': 'Glow spread', 'th.glow_strength': 'Glow strength', 'th.ticks_sec': 'Ticks', 'th.ticks': 'Tick density',
    'th.scale': 'Scale colors', 'th.look_title': 'Temperature colors', 'th.look_hint': 'The colours of the scale and the two temperatures where it turns from cool to warm. Glow and ticks are for every dial: Settings > Design > Dials.', 'th.reset_scale': 'Reset the temperature colors',
    'dl.wheel': 'Wheel', 'dl.wheel_sub': 'Thermostat, lights', 'dl.dial': 'Dial', 'dl.dial_sub': 'Fan, humidity', 'dl.slider': 'Slider', 'dl.slider_sub': 'Sliders everywhere', 'dl.hint': 'Drag any of them: this is exactly how every dial and slider looks.', 'th.c0': 'Coldest', 'th.c1': 'Cool', 'th.c2': 'Warm', 'th.c3': 'Hottest', 'th.cool_until': 'Cool until', 'th.warm_from': 'Warm from', 'th.reset_look': 'Reset dial look',
  });
  core.registerStrings('de', {
    'th.eyebrow': 'Temperatur', 'th.now': 'Jetzt', 'th.hold': 'Zum Ausschalten halten', 'th.off_note': 'Aus. Tippe auf das Ein/Aus-Symbol zum Einschalten', 'th.schedule': 'Zeitplan festlegen',
    'th.unavailable': 'Gerade nicht erreichbar', 'th.min': 'Min', 'th.max': 'Max', 'th.lower': 'Niedriger', 'th.raise': 'Höher',
    'th.st.cooling': 'Kühlt', 'th.st.heating': 'Heizt', 'th.st.idle': 'Leerlauf', 'th.st.off': 'Aus', 'th.st.drying': 'Entfeuchtet', 'th.st.fan': 'Lüfter',
    'th.light_off': 'Aus. Dreh am Rad oder tippe auf Einschalten', 'th.turn_off': 'Ausschalten', 'th.turn_on': 'Einschalten', 'th.light_sched': 'Zeitplan festlegen', 'th.colors': 'Farben',
    'th.look': 'Aussehen des Rads', 'th.glow': 'Leuchten', 'th.glow_blur': 'Leuchten: Unschärfe', 'th.glow_spread': 'Leuchten: Ausbreitung', 'th.glow_strength': 'Leuchten: Stärke', 'th.ticks_sec': 'Striche', 'th.ticks': 'Strichdichte',
    'th.scale': 'Farbskala', 'th.look_title': 'Temperaturfarben', 'th.look_hint': 'Die Farben der Skala und die zwei Temperaturen, ab denen sie von kühl zu warm wechselt. Glühen und Striche gelten für jeden Drehregler: Einstellungen > Design > Drehregler.', 'th.reset_scale': 'Temperaturfarben zurücksetzen',
    'dl.wheel': 'Rad', 'dl.wheel_sub': 'Thermostat, Lichter', 'dl.dial': 'Regler', 'dl.dial_sub': 'Ventilator, Feuchte', 'dl.slider': 'Schieber', 'dl.slider_sub': 'Schieber überall', 'dl.hint': 'Zieh an einem davon: so sieht jeder Drehregler und Schieber aus.', 'th.c0': 'Kälteste', 'th.c1': 'Kühl', 'th.c2': 'Warm', 'th.c3': 'Heißeste', 'th.cool_until': 'Kühl bis', 'th.warm_from': 'Warm ab', 'th.reset_look': 'Aussehen zurücksetzen',
  });

  // The scene is drawn in a 400 x 300 box that is kept at the right edge of the control: the wheel keeps its shape on a phone and on a wide screen.
  var CX = 425, CY = 150, R_OUT = 150, R_TICK = 148, R_IN = 135, R_MAJOR = 127, SWEEP = 236, START = 64, TICKS = 130, MAJOR_EVERY = 5;
  var RIM_R = R_OUT + 2.1;                              // the solid rim; the ticks end at R_TICK, a small gap (about 3 units, a quarter of a tick) inside its inner edge, as in the original project
  var GLOW_SPREAD = 60;                                  // the glow reaches this far (scene units) inside and outside the rim; beyond it the Gaussian is below 1 %
  var SEND_DEBOUNCE_MS = 450, HOLD_MS = 3000, DRAG_SENS = .035, WHEEL_SENS = .01;

  var ICON = {
    heat: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3C14.2 7.2 17.75 9.6 17.75 15.25A5.75 5.75 0 1 1 6.25 15.25C6.25 9.6 9.8 7.2 12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    cool: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2v20M4.5 6l15 12M19.5 6l-15 12M2 12h20M6 4.5l12 15M18 4.5L6 19.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    heat_cool: '<svg viewBox="0 0 24 24" fill="none"><circle cx="7" cy="7" r="2.2" stroke="currentColor" stroke-width="1.4"/><path d="M7 1.8v1.4M7 10.8v1.4M1.8 7h1.4M10.8 7h1.4M3.3 3.3l1 1M9.7 9.7l1 1M3.3 10.7l1-1M9.7 4.3l1-1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M17 11.5v11M12.3 14.2l9.400 5.600M21.700 14.200l-9.400 5.600" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dry: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3c3.2 4.2 6 7 6 10.4A6 6 0 0 1 6 13.4C6 10 8.8 7.200 12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    fan_only: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="1.8" stroke="currentColor" stroke-width="1.6"/><path d="M12 10.2C12 6 10.6 3.500 8.600 4c-2 .6-1.400 4.200 3.400 6.200ZM13.800 12c4.200 0 6.700 1.400 6.200 3.400-.6 2-4.200 1.400-6.200-3.400ZM12 13.800c0 4.200 1.400 6.700 3.400 6.200 2-.6 1.400-4.200-3.400-6.200ZM10.200 12C6 12 3.500 10.600 4 8.600c.6-2 4.200-1.400 6.200 3.400Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    off: '<svg viewBox="0 0 15 15" fill="none"><path d="M7.500 1.500v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4.300 3.300a5.600 5.600 0 1 0 6.400 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };
  ICON.auto = ICON.heat_cool;

  var uid = 0;
  function svgEl(name, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', name);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }
  function pt(r, deg) { var a = deg * Math.PI / 180; return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) }; }

  /**
   * The wheel itself, one drawing for the dial and for the preview in the settings: the glow around the rim (a radial gradient with the Gaussian a Figma drop shadow draws:
   * no stacked strokes, which show as faint rings, and no blur filter, which repaints badly on iOS), the dark disc the wheel turns on, the solid rim and the ticks.
   * -> { svg, paint(value, min, max, unit, spin) -> 'r,g,b' (turns the ticks and colours glow and rim), look }
   */
  function buildWheel(look) {
    var lk = normalizeLook(look), reach = glowReach(lk), gId = 'thg' + (++uid);
    var svg = svgEl('svg', { class: 'th-gauge', viewBox: '0 0 400 300', preserveAspectRatio: 'xMaxYMid meet', 'aria-hidden': 'true' });
    var defs = svgEl('defs'), gg = svgEl('radialGradient', { id: gId, gradientUnits: 'userSpaceOnUse', cx: CX, cy: CY, r: RIM_R + reach }), glowStops = [];
    var glowBase = [];
    function addStop(off, a) { var st = svgEl('stop', { offset: Math.max(0, Math.min(1, off)).toFixed(4), 'stop-color': '#ff2d55', 'stop-opacity': +a.toFixed(4) }); gg.appendChild(st); glowStops.push(st); glowBase.push(a); }
    addStop(0, 0);
    for (var k = -6; k <= 6; k++) { var gd = reach * k / 6; addStop((RIM_R + gd) / (RIM_R + reach), glowAlpha(gd, lk)); }
    defs.appendChild(gg); svg.appendChild(defs);
    svg.appendChild(svgEl('circle', { class: 'th-glowfill', cx: CX, cy: CY, r: RIM_R + reach, fill: 'url(#' + gId + ')' }));
    svg.appendChild(svgEl('circle', { class: 'th-disc', cx: CX, cy: CY, r: R_OUT + 1, fill: '#0b0908', 'fill-opacity': '.06' }));
    var glow = svgEl('g', { class: 'th-glow' });
    glow.appendChild(svgEl('circle', { class: 'th-rim', cx: CX, cy: CY, r: RIM_R, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9 }));
    svg.appendChild(glow);
    var ticks = svgEl('g', { class: 'th-ticks' }), count = tickCount(lk), tickStep = 360 / count;
    for (var i = 0; i < count; i++) {
      var major = i % MAJOR_EVERY === 0, a = i * tickStep, p1 = pt(major ? R_MAJOR : R_IN, a), p2 = pt(R_TICK, a);
      ticks.appendChild(svgEl('line', { class: 'th-tick', x1: p1.x.toFixed(1), y1: p1.y.toFixed(1), x2: p2.x.toFixed(1), y2: p2.y.toFixed(1), 'stroke-width': major ? 1.3 : 1.0, stroke: 'rgba(235,200,208,.55)' }));
    }
    svg.appendChild(ticks);
    var lastGain = -1;
    // opt (a light): { degPerUnit: degrees the wheel turns per unit, rgb: the colour of the rim and glow (else the temperature scale), gain: 0..1 the glow strength }
    function paint(value, min, max, unit, spin, opt) {
      opt = opt || {};
      var rot = opt.degPerUnit != null ? (value - min) * opt.degPerUnit : rotationFor(value, min, unit);
      ticks.setAttribute('transform', 'rotate(' + (rot + (spin || 0)).toFixed(2) + ' ' + CX + ' ' + CY + ')');
      var c = opt.rgb || colorFor(value, min, max, unit, lk), rgb = c.r + ',' + c.g + ',' + c.b;
      glow.style.color = 'rgb(' + rgb + ')';
      glowStops.forEach(function (st) { st.setAttribute('stop-color', 'rgb(' + rgb + ')'); });
      var gain = opt.gain == null ? 1 : opt.gain;
      if (gain !== lastGain) { lastGain = gain; glowStops.forEach(function (st, i) { st.setAttribute('stop-opacity', (glowBase[i] * gain).toFixed(4)); }); }
      return rgb;
    }
    return { svg: svg, paint: paint, look: lk };
  }

  /**
   * The "Dial look" section of a thermostat's Settings tab: a preview of the wheel that follows every change at once, sliders for the glow (blur, spread, strength) and the tick
   * density, the four colours of the scale with the two temperatures where it changes, and a button that puts everything back. Saved per device like every setting
   * (settings.thermo); the dial reads them when the Controls open. Double-tap a slider for its default.
   */
  function lookPanel(ctx, item) {
    var t = function (k) { return core.t(k, ctx.lang()); }, CT = g.OkieMotor.controls;
    var root = h('div.thl'), draft = null;
    var a = ((ctx.state(item.id) || {}).attributes) || {}, hs = ctx.hass();
    var unit = (hs && hs.config && hs.config.unit_system && hs.config.unit_system.temperature) || '°C';
    var min = isFinite(+a.min_temp) && a.min_temp != null ? +a.min_temp : (unit === '°F' ? 45 : 7), max = isFinite(+a.max_temp) && a.max_temp != null ? +a.max_temp : (unit === '°F' ? 95 : 35);
    var stepU = unit === '°F' ? 1 : 0.5;
    function toU(f) { return unit === '°C' ? Math.round((f - 32) * 5 / 9 * 2) / 2 : Math.round(f); }       // the limits are stored in whole degrees Fahrenheit
    function toFh(u) { return unit === '°C' ? Math.round(u * 9 / 5 + 32) : u; }
    function kv(key, v) { var o = {}; o[key] = v; return o; }
    function build() {
      root.innerHTML = '';
      draft = normalizeLook(ctx.settings.get().thermo);
      var bar = h('div.thl-bar'), marks = h('div.thl-marks');
      function redraw() {
        var lk = normalizeLook(draft), lo = toF(min, unit), hi = toF(max, unit), span = Math.max(1, hi - lo);
        var pc = clamp((lk.cool - lo) / span * 100, 0, 100), pw = clamp((lk.warm - lo) / span * 100, 0, 100);
        bar.style.background = 'linear-gradient(90deg,' + lk.c0 + ' 0%,' + lk.c1 + ' ' + pc.toFixed(1) + '%,' + lk.c2 + ' ' + pw.toFixed(1) + '%,' + lk.c3 + ' 100%)';
        marks.innerHTML = '';
        [[0, Math.round(min) + unit.replace('°', '°'), 'l'], [pc, toU(lk.cool) + unit, 'm'], [pw, toU(lk.warm) + unit, 'm'], [100, Math.round(max) + unit, 'r']].forEach(function (m) { marks.appendChild(h('span.thl-mk.' + m[2], { style: { left: m[0].toFixed(1) + '%' } }, m[1])); });
      }
      function sliderRow(label, key, lo, hi, st, format, toStore, fromStore) {
        toStore = toStore || function (v) { return v; }; fromStore = fromStore || function (v) { return v; };
        var sl = CT.createSlider({ min: lo, max: hi, step: st, value: fromStore(draft[key]), ariaLabel: label, format: format,
          onInput: function (v) { draft[key] = toStore(v); redraw(); },
          onChange: function (v) { draft[key] = toStore(v); ctx.settings.set({ thermo: kv(key, draft[key]) }); redraw(); },
          onDoubleTap: function () { var d = ctx.settings.defaultOf('thermo.' + key); ctx.settings.reset('thermo.' + key); draft[key] = d; sl.set(fromStore(d)); redraw(); } });
        return h('div.thl-row', null, h('span.thl-l', null, label), sl.el);
      }
      function colorRow(label, key) {
        var inp = h('input.thl-color', { type: 'color', 'aria-label': label });
        inp.value = draft[key];
        inp.addEventListener('input', function () { draft[key] = inp.value; redraw(); });
        inp.addEventListener('change', function () { draft[key] = inp.value; ctx.settings.set({ thermo: kv(key, inp.value) }); redraw(); });
        return h('label.thl-c', null, inp, h('span', null, label));
      }
      root.appendChild(h('div.lbl', null, t('th.look_title')));
      root.appendChild(h('div.thl-hint', null, t('th.look_hint')));
      root.appendChild(bar); root.appendChild(marks);
      root.appendChild(h('div.thl-cols', null, colorRow(t('th.c0'), 'c0'), colorRow(t('th.c1'), 'c1'), colorRow(t('th.c2'), 'c2'), colorRow(t('th.c3'), 'c3')));
      var degree = function (v) { return v + unit; };
      root.appendChild(sliderRow(t('th.cool_until'), 'cool', toU(40), toU(90), stepU, degree, toFh, toU));
      root.appendChild(sliderRow(t('th.warm_from'), 'warm', toU(45), toU(95), stepU, degree, toFh, toU));
      root.appendChild(h('div.actrow', null, h('button.act', { onclick: function () { ['c0', 'c1', 'c2', 'c3', 'cool', 'warm'].forEach(function (k) { ctx.settings.reset('thermo.' + k); }); build(); } }, h('span', null, t('th.reset_scale')))));
      redraw();
    }
    build();
    return { el: root, dispose: function () {} };
  }

  /**
   * The "Dials" preview of the main Settings (Design tab): the three kinds of control that follow the dial look, drawn exactly as they are everywhere else - the tick wheel of the
   * thermostat and the lights, the arc dial of fans and humidifiers, the slider - on a dark glass card so the glow can be seen. It follows every change of the sliders below at once.
   */
  function dialPreview(ctx) {
    var t = function (k) { return core.t(k, ctx.lang ? ctx.lang() : 'en'); }, CT = g.OkieMotor.controls;
    var root = h('div.dlp'), wheelHost = h('div.dlp-wheel'), wheelNum = h('div.dlp-num', null, '72°');
    function cell(cls, content, name, sub) { return h('div.dlp-cell.' + cls, null, h('div.dlp-art', null, content), h('div.dlp-cap', null, h('b', null, name), h('span', null, sub))); }
    var dial = CT.createDial({ min: 0, max: 100, step: 1, value: 64, size: 132, ariaLabel: t('dl.dial'), gradient: ['#1b8f8f', '#6be3df'], format: function (v) { return Math.round(v) + '%'; } });
    var slider = CT.createSlider({ min: 0, max: 100, step: 1, value: 62, color: '#fff', ariaLabel: t('dl.slider') });
    function redrawWheel() {
      var lk = normalizeLook(ctx.settings.get().thermo), w = buildWheel(lk);
      w.svg.setAttribute('viewBox', '235 -40 380 380'); w.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      w.paint(72, 50, 90, '°F', 0);
      wheelHost.innerHTML = ''; wheelHost.appendChild(w.svg);
    }
    root.appendChild(h('div.dlp-grid', null,
      cell('c-wheel', h('div.dlp-wheelbox', null, wheelHost, wheelNum), t('dl.wheel'), t('dl.wheel_sub')),
      cell('c-dial', dial.el, t('dl.dial'), t('dl.dial_sub')),
      cell('c-slider', slider.el, t('dl.slider'), t('dl.slider_sub'))));
    root.appendChild(h('div.dlp-hint', null, t('dl.hint')));
    redrawWheel();
    var off = ctx.settings.on('change', function (p) { if (p && p.thermo !== undefined) { if (!root.isConnected && root._seen) { if (off) off(); return; } root._seen = root.isConnected || root._seen; redrawWheel(); } });
    return { el: root, dispose: function () { if (off) off(); } };
  }

  /**
   * create({ unit, min, max, step, value, comma, labels:{eyebrow, now, hold, offNote, schedule, unavailable, min, max},
   *          modes:[{ id, label }], haptic(ms), onSend(value), onMode(id), onOff(), onOn(), onSchedule(), onBump('low'|'high', dir) })
   * -> { el, set(serverValue), setRange(min, max, step, unit), setCurrent(text), setMode(id), setOff(bool), setRanged(bool, lo, hi), setUnavailable(bool), dispose() }
   */
  function create(o) {
    var unit = o.unit || '°F', min = o.min, max = o.max, step = o.step || 1, L = o.labels || {};
    // A light uses the same wheel: o.degPerUnit (degrees the wheel turns per percent), o.sens (value units per pixel of dragging), o.gainOf(value) (how strong the glow is), o.liveMs (send
    // while dragging, every so often), o.tapPower (a tap turns it off), o.dragWhenOff (turning the wheel of an off light switches it on), o.swatches / o.onSwatch (colour buttons)
    var dpu = o.degPerUnit != null ? o.degPerUnit : null;
    var s = { value: o.value != null ? o.value : min, dragging: false, off: false, ranged: false, pendingAt: 0, pendingValue: null, lastBuzz: null, spin: 0, rgb: null };
    var sendTimer = null, endTimer = null, holdTimer = null, coastRAF = null, introRAF = null, disposed = false;

    // ---- the wheel (see buildWheel) ----
    var W = buildWheel(o.look), svg = W.svg;
    var wrap = h('div.th-gaugewrap', null, svg);

    // ---- the readout, the modes and the touch zone ----
    var eyebrow = h('div.th-eyebrow', null, (L.eyebrow || 'Temperature') + ', ' + unit);
    var numEl = h('div.th-num', null, fmt(s.value, step, o.comma));
    var digits = function () { numEl.dataset.len = String(numEl.textContent.replace(/\D/g, '').length); };      // three digits (100 %) get a smaller number so it never reaches the dial
    digits();
    var nowEl = h('div.th-now');
    var lowV = h('b.rv'), highV = h('b.rv');
    function rangeRow(label, valEl, key) {
      return h('div.rr', null, h('span', null, label),
        h('button.stp', { 'aria-label': label + ' -', onclick: function () { if (o.onBump) o.onBump(key, -1); }, html: UI.icon('minus', 18) }), valEl,
        h('button.stp', { 'aria-label': label + ' +', onclick: function () { if (o.onBump) o.onBump(key, 1); }, html: UI.icon('plus', 18) }));
    }
    var rangeEl = h('div.th-range', { hidden: true }, rangeRow(L.min || 'Min', lowV, 'low'), rangeRow(L.max || 'Max', highV, 'high'));
    var sched = o.onSchedule ? h('button.th-sched', { onclick: function () { o.onSchedule(); } }, h('span.th-sched-ic', { html: ICON.clock }), h('span', null, L.schedule || 'Set smart schedule'), h('span.th-sched-chev', { html: ICON.chev })) : null;
    var modeBtns = {};
    var modesEl = h('div.th-modes');
    (o.modes || []).forEach(function (m) {
      var b = h('button.th-mode' + (m.swatch ? '.hsw' : ''), { dataset: { mode: m.id }, 'aria-label': m.label, 'aria-pressed': 'false', onclick: function () { if (o.onMode) o.onMode(m.id); } },
        h('span.th-mode-ic', { html: m.swatch ? '' : (ICON[m.id] || ICON.heat_cool) }), h('span.th-mode-l', null, m.label));
      if (m.swatch) b.style.setProperty('--sw', m.swatch);
      modeBtns[m.id] = b; modesEl.appendChild(b);
    });
    modesEl.hidden = !(o.modes || []).length;
    var swEl = null, swBtns = {};
    if (o.swatches && o.swatches.length) {
      swEl = h('div.th-swatches', { role: 'group', 'aria-label': L.colors || 'Colours' });
      o.swatches.forEach(function (sw) {
        var b = h('button.th-sw', { dataset: { sw: sw.id }, 'aria-label': sw.label || String(sw.id), 'aria-pressed': 'false', onclick: function () { if (o.onSwatch) o.onSwatch(sw.id); } });
        b.style.background = sw.css; swBtns[sw.id] = b; swEl.appendChild(b);
      });
    }
    var offNote = h('div.th-offnote', null, L.offNote || 'Off. Tap the power icon to turn on');
    // the name and what it is doing (wide screens: at the top of the glass column; a phone shows both in the picture above), and - / + under the number
    var nameEl = h('div.th-name'), stateEl = h('div.th-state'), titleEl = h('div.th-title', null, nameEl, stateEl);
    var stepEl = null;
    if (o.stepper) stepEl = h('div.th-step', null,
      h('button.th-stp', { 'aria-label': L.lower || 'Lower', onclick: function () { stepBy(-1); }, html: '&minus;' }),
      h('button.th-stp', { 'aria-label': L.raise || 'Raise', onclick: function () { stepBy(1); }, html: '+' }));
    var left = h('div.th-left', null, titleEl, h('div.th-readout', null, eyebrow, numEl, nowEl, stepEl, offNote, rangeEl), h('div.th-bottom', null, sched, modesEl, swEl));
    var zone = h('div.th-zone', { tabindex: '0', role: 'slider', 'aria-label': L.eyebrow || 'Temperature' });
    var unavNote = h('div.th-unav', { hidden: true }, L.unavailable || 'Not reachable right now');
    var root = h('div.th' + (o.cls ? '.' + o.cls : ''), { dataset: { ranged: 'false' } }, wrap, left, zone, unavNote);

    // ---- the power button ----
    var ring = h('span.th-ring', { html: '<svg class="th-prog" width="26" height="26" viewBox="0 0 38 38"><circle cx="19" cy="19" r="17"/></svg><span class="th-pic">' + ICON.off + '</span>' });
    var powerL = h('span.th-power-l', null, o.tapPower ? (L.turnOff || 'Turn off') : (L.hold || 'Hold to turn off'));
    var power = h('button.th-power', { 'aria-label': o.tapPower ? (L.turnOff || 'Turn off') : (L.hold || 'Hold to turn off') }, ring, powerL);
    var foot = h('div.th-foot', null, power);
    root.appendChild(foot);
    var el = h('div.th-wrap', null, root);
    function cancelHold() { clearTimeout(holdTimer); holdTimer = null; power.classList.remove('holding'); }
    if (o.tapPower) power.addEventListener('click', function () { if (s.off) { if (o.onOn) o.onOn(); } else if (o.onOff) o.onOff(); });
    else power.addEventListener('pointerdown', function (e) {
      if (s.off) { if (o.onOn) o.onOn(); return; }
      if (e.pointerId != null && power.setPointerCapture) { try { power.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } }
      power.classList.add('holding');
      holdTimer = setTimeout(function () { power.classList.remove('holding'); holdTimer = null; if (o.onOff) o.onOff(); }, HOLD_MS);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { power.addEventListener(ev, cancelHold); });

    // ---- wide screens: the picture of the wheel is drawn taller (see the CSS below) ----
    function wide() { return true; }      // the design's wheel everywhere (phones too)
    // The card's height and width in layout pixels, measured (offset / client sizes are the same in every engine, also inside the card's CSS zoom). The CSS takes them from
    // --th-ch / --th-cw instead of the container query units 100cqh / 100cqw, which Safari does not resolve the same way inside a zoomed column (on an iPad the wheel came out
    // far too small). Without the measurement the CSS falls back to the units.
    var dtBox = null;
    function measureContainer() {
      var dt = dtBox || (root.closest ? root.closest('.dt') : null);
      if (!dt) return null;
      if (dt !== dtBox) { dtBox = dt; if (ro) ro.observe(dt); }
      var main = (g.innerWidth || 1200) <= 640 && root.closest ? root.closest('.dt-main') : null, ch = (main || dt).clientHeight, cw = dt.clientWidth;      // a phone: the glass under the picture
      if (ch > 0) root.style.setProperty('--th-ch', ch + 'px');
      if (cw > 0) root.style.setProperty('--th-cw', cw + 'px');
      return { ch: ch, cw: cw };
    }
    function place() {
      // wide: the wheel is as tall as its box and the card's right edge cuts the picture at 344 of 400 scene units, so the wheel shows about 146 px, as in the design (the picture fills
      // the box like "slice": the larger of the two scales wins);
      // narrow (phones): like the design on a wide screen the wheel runs the whole height of the card (its circle is 98 % of the height, the right edge of the card cuts it), its
      // middle sits at half the height and the left end of its ticks at 66 % of the width (the original project's depth), whatever height the card has.
      // Either way the viewBox has the shape of the box, so nothing is stretched or cut.
      var c = measureContainer(), isWide = wide();
      var bw = wrap.clientWidth, bh = wrap.clientHeight, vb = null, sc = 0;
      if (bw > 0 && bh > 0) {
        if (isWide) { sc = Math.max(bw / 344, bh / 300); var vw = bw / sc, vh = bh / sc; vb = [344 - vw, (300 - vh) / 2, vw, vh]; }
        else { var vbH = 300 / 0.98, vbW = vbH * bw / bh; sc = bh / vbH; vb = [CX - R_OUT - 0.66 * vbW, CY - 0.5 * vbH, vbW, vbH]; }
      }
      svg.setAttribute('viewBox', vb ? vb.map(function (n) { return n.toFixed(1); }).join(' ') : (isWide ? '0 0 344 300' : '0 0 400 300'));
      svg.setAttribute('preserveAspectRatio', vb ? 'xMaxYMid meet' : (isWide ? 'xMaxYMid slice' : 'xMaxYMid meet'));
      g.OkieMotor.thermoLayout = { win: (g.innerWidth || 0) + 'x' + (g.innerHeight || 0), card: c ? c.cw + 'x' + c.ch : '-', dial: root.clientWidth + 'x' + root.clientHeight, wheel: bw + 'x' + bh, scale: sc ? +sc.toFixed(2) : 0, wide: isWide };
    }
    var ro = null;
    function fit() { if (!disposed) place(); }
    var fitQueued = false;
    function queueFit() { if (fitQueued) return; fitQueued = true; requestAnimationFrame(function () { fitQueued = false; fit(); }); }      // never change layout inside the observer callback itself (the browser would warn about a resize loop)
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(queueFit); ro.observe(root); }
    g.addEventListener('resize', fit);
    var fitTimers = [0, 80, 400, 1200].map(function (ms) { return setTimeout(fit, ms); });      // a layout callback can be late (a hidden tab, a slow phone): the dial fits itself on a few short timers too

    // ---- painting ----
    function paint(v) {
      s.value = v;
      numEl.textContent = fmt(v, step, o.comma); digits();
      var rgb = W.paint(v, min, max, unit, s.spin, dpu != null ? { degPerUnit: dpu, rgb: s.rgb, gain: o.gainOf ? o.gainOf(v) : 1 } : null);
      root.style.setProperty('--th-accent', 'rgb(' + rgb + ')');
      root.style.setProperty('--th-accent-rgb', rgb);
      foot.style.setProperty('--th-accent', 'rgb(' + rgb + ')');
      zone.setAttribute('aria-valuemin', String(min)); zone.setAttribute('aria-valuemax', String(max)); zone.setAttribute('aria-valuenow', String(snapTo(v, min, max, step)));
      root.classList.toggle('dec', step < 1);
    }
    function buzz(v) {
      var n = snapTo(v, min, max, o.buzzStep || step);      // a tick for every number the display passes, like a wheel with detents
      if (n === s.lastBuzz) return;
      s.lastBuzz = n;
      if (o.haptic) o.haptic(5);
      numEl.classList.remove('buzz'); void numEl.offsetWidth; numEl.classList.add('buzz');
    }
    function scheduleSend() {
      if (o.liveMs) { if (!sendTimer) sendTimer = setTimeout(sendNow, o.liveMs); return; }      // a light follows the wheel while it turns: one send every liveMs, the last one always goes out
      clearTimeout(sendTimer);
      sendTimer = setTimeout(sendNow, SEND_DEBOUNCE_MS);
    }
    function sendNow() {
      clearTimeout(sendTimer); sendTimer = null;
      var v = snapTo(s.value, min, max, step);
      s.pendingAt = Date.now(); s.pendingValue = v;
      if (o.onSend) o.onSend(v);
    }
    // A change is the user's the moment it is made, not when it is sent 450 ms later: any update that arrives from the thermostat in between (its temperature now, its fan, ...) still carries the OLD
    // target, and used to paint it back over the new one, so the number jumped back and the old value was sent.
    function setValue(v) { v = clamp(v, min, max); s.pendingAt = Date.now(); s.pendingValue = snapTo(v, min, max, step); paint(v); buzz(v); scheduleSend(); }
    function stepBy(dir) { if (!usable()) return; stopCoast(); setValue(snapTo(s.value + dir * (o.stepSize || step), min, max, step)); }      // a light steps 5 % a tap, a thermostat one degree

    // ---- moving the wheel: drag, scroll, arrow keys, with coasting ----
    var unitK = o.sens ? o.sens / DRAG_SENS : (unit === '°C' ? 0.56 : 1), coastK = o.sens ? unitK : 1;                 // a Celsius degree is a bigger step than a Fahrenheit one; a light moves in percent
    var velocity = 0, lastInput = 0, dragY = 0, dragT = 0;
    function stopCoast() { if (coastRAF) { cancelAnimationFrame(coastRAF); coastRAF = null; } }
    function nudge(delta, dt) { stopCoast(); setValue(s.value + delta); velocity = nudgeVelocity(velocity, delta, dt); }
    function coast() {
      if (Math.abs(velocity) < .006 * coastK) { velocity = 0; s.dragging = false; return; }
      var last = performance.now();
      (function frame(now) {
        if (disposed) return;
        var st = coastStep(velocity, now - last); last = now;
        var next = s.value + st.delta, edge = next <= min || next >= max;
        setValue(next); velocity = st.velocity;
        if (edge || Math.abs(velocity) < .006 * coastK) { velocity = 0; coastRAF = null; s.dragging = false; return; }
        coastRAF = requestAnimationFrame(frame);
      })(last);
    }
    function endSoon() { clearTimeout(endTimer); endTimer = setTimeout(function () { lastInput = 0; coast(); }, 110); }
    function usable() { return (!s.off || !!o.dragWhenOff) && !root.classList.contains('unavail'); }
    zone.addEventListener('selectstart', function (e) { e.preventDefault(); });
    zone.addEventListener('wheel', function (e) {
      if (!usable()) return;
      e.preventDefault(); s.dragging = true;
      var now = performance.now(), dt = lastInput ? now - lastInput : -1; lastInput = now;
      nudge(-e.deltaY * WHEEL_SENS * unitK, dt); endSoon();
    }, { passive: false });
    zone.addEventListener('pointerdown', function (e) {
      if (!usable()) return;
      s.dragging = true; dragY = e.clientY; dragT = performance.now(); velocity = 0;
      try { zone.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
      stopCoast(); clearTimeout(endTimer); zone.dataset.drag = 'true';
    });
    zone.addEventListener('pointermove', function (e) {
      if (zone.dataset.drag !== 'true') return;
      var now = performance.now(), dy = e.clientY - dragY, dt = now - dragT; dragY = e.clientY; dragT = now;
      nudge(-dy * DRAG_SENS * unitK, dt);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) { zone.addEventListener(ev, function () { if (zone.dataset.drag === 'true') { zone.dataset.drag = 'false'; velocity = releaseVelocity(velocity, performance.now() - dragT); coast(); } }); });
    zone.addEventListener('keydown', function (e) {
      if (!usable()) return;
      var dir = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : e.key === 'PageUp' ? 5 : e.key === 'PageDown' ? -5 : 0;
      if (!dir) return;
      e.preventDefault(); setValue(snapTo(s.value + dir * step, min, max, step));
    });

    // ---- the wheel slides in when the control opens ----
    paint(s.value);
    var reduce = false; try { reduce = g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* no matchMedia */ }
    if (!reduce) {
      var t0 = performance.now(), dur = 700;
      (function intro(now) {
        if (disposed) return;
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        wrap.style.opacity = String(e); wrap.style.transform = 'translateX(' + (60 * (1 - e)).toFixed(1) + 'px)'; s.spin = 90 * (1 - e); paint(s.value);
        if (p < 1) introRAF = requestAnimationFrame(intro); else { introRAF = null; wrap.style.opacity = ''; wrap.style.transform = ''; s.spin = 0; paint(s.value); }
      })(t0);
    }

    return {
      el: el,
      set: function (server) {
        var r = resolveTarget({ server: server == null ? null : snapTo(server, min, max, step), pendingAt: s.pendingAt, pendingValue: s.pendingValue, now: Date.now() });
        if (!r.pending) s.pendingAt = 0;
        if (!s.dragging && r.value != null) paint(r.value);
      },
      setRange: function (mn, mx, st, u) {
        var changed = mn !== min || mx !== max || st !== step || (u && u !== unit);
        min = mn; max = mx; step = st || step; if (u) unit = u;
        eyebrow.textContent = (L.eyebrow || 'Temperature') + ', ' + unit;
        if (changed) paint(s.value);
      },
      setCurrent: function (text) { nowEl.textContent = text || ''; },
      /** The name and the state under it (Cooling, Heating, idle, Off). */
      setTitle: function (name, state) { nameEl.textContent = name || ''; stateEl.textContent = state || ''; },
      /** A light: the colour of the rim and the glow, { r, g, b } (the temperature scale when none is given). */
      setColor: function (c) { s.rgb = c || null; paint(s.value); },
      setSwatch: function (id) { Object.keys(swBtns).forEach(function (k) { var on = String(k) === String(id); swBtns[k].classList.toggle('active', on); swBtns[k].setAttribute('aria-pressed', on ? 'true' : 'false'); }); },
      setMode: function (id) { Object.keys(modeBtns).forEach(function (k) { var on = k === id; modeBtns[k].classList.toggle('active', on); modeBtns[k].setAttribute('aria-pressed', on ? 'true' : 'false'); }); },
      setOff: function (b) {
        s.off = !!b; root.classList.toggle('off', s.off); if (s.off) cancelHold();
        var lbl = o.tapPower ? (s.off ? (L.turnOn || 'Turn on') : (L.turnOff || 'Turn off')) : (s.off ? (L.turnOn || 'Turn on') : (L.hold || 'Hold to turn off'));
        power.setAttribute('aria-label', lbl); if (o.tapPower) powerL.textContent = lbl;
      },
      setRanged: function (b, lo, hi) {
        s.ranged = !!b; root.dataset.ranged = s.ranged ? 'true' : 'false'; rangeEl.hidden = !s.ranged; if (stepEl) stepEl.hidden = s.ranged;
        if (s.ranged) { lowV.textContent = lo == null ? '–' : lo + '°'; highV.textContent = hi == null ? '–' : hi + '°'; }
      },
      setUnavailable: function (b) { root.classList.toggle('unavail', !!b); unavNote.hidden = !b; },
      /** The wheel rolls out to the right, the way it rolled in (used when another tab of the detail view is chosen). Resolves when it has gone. */
      rollOut: function () {
        return new Promise(function (resolve) {
          var done = false, dur = 420;
          function finish() { if (done) return; done = true; resolve(); }
          if (reduce || disposed) return finish();
          if (introRAF) { cancelAnimationFrame(introRAF); introRAF = null; }
          var t1 = performance.now();
          setTimeout(finish, dur + 250);                       // never wait for a frame that does not come (a hidden tab)
          (function out(now) {
            if (disposed || done) return;
            var p = Math.min(1, (now - t1) / dur), e = p * p * p;
            wrap.style.opacity = String(1 - e); wrap.style.transform = 'translateX(' + (60 * e).toFixed(1) + 'px)'; s.spin = 90 * e; paint(s.value);
            if (p < 1) requestAnimationFrame(out); else finish();
          })(t1);
        });
      },
      dispose: function () {
        disposed = true; cancelHold(); stopCoast(); clearTimeout(endTimer);
        if (ro) ro.disconnect();
        fitTimers.forEach(clearTimeout);
        g.removeEventListener('resize', fit);
        if (introRAF) cancelAnimationFrame(introRAF);
        if (sendTimer) sendNow();                           // a change made just before leaving still reaches the thermostat
      },
      _state: s,
    };
  }

  var CSS = [
    '.dctl.thermo{align-items:stretch;gap:14px;font-family:"Okie Manrope",var(--okie-font);}',      // the fonts of the Thermo Dial project, embedded by okie-thermo-fonts.js
    '.th-wrap{display:flex;flex-direction:column;gap:6px;width:100%;}',
    '.th{position:relative;width:100%;--th-h:clamp(232px,36vh,340px);height:var(--th-h);border-radius:28px;overflow:hidden;--th-accent:#ff2d55;--th-accent-rgb:255,45,85;color:#f6f5f7;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}',
    '.th-gaugewrap{position:absolute;left:0;right:0;top:0;height:100%;pointer-events:none;}.th-gauge{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}',
    '.th-tick{stroke-linecap:round;transition:opacity .4s ease;}',
    '.th-left{position:absolute;z-index:3;left:18px;top:16px;bottom:14px;width:56%;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none;}',
    '.th-left button{pointer-events:auto;}',
    '.th-readout{display:flex;flex-direction:column;align-items:flex-start;gap:8px;}',
    '.th-eyebrow{font-size:12px;font-weight:700;line-height:1;letter-spacing:2.2px;text-transform:uppercase;color:rgba(255,255,255,.62);}',
    // the name and the state under it (wide screens only), and the - / + under the number
    '.th-title{display:none;}.th-name{font-size:14px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;color:rgba(255,255,255,.7);}.th-state{margin-top:7px;font-size:24px;font-weight:700;line-height:1.1;color:var(--th-accent);transition:color .4s ease;}',
    '.th-step{display:flex;gap:12px;margin-top:14px;}.th-step[hidden]{display:none;}.th.off .th-step{opacity:.35;pointer-events:none;}',
    '.th-stp{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.26);background:rgba(255,255,255,.12);color:#fff;font-size:26px;font-weight:500;line-height:1;padding:0;display:grid;place-items:center;pointer-events:auto;}.th-stp:active{background:rgba(255,255,255,.24);}',
    '.th-num{font-family:"Okie Sora",var(--okie-font);font-size:calc(var(--th-h) * .3);font-weight:800;line-height:.9;letter-spacing:-.03em;font-variant-numeric:tabular-nums;text-shadow:0 0 36px rgba(var(--th-accent-rgb),.28);}',
    '.th.dec .th-num{font-size:calc(var(--th-h) * .22);}',
    '.th-num.buzz{animation:thBuzz .14s ease;}@keyframes thBuzz{0%{transform:translateX(0)}30%{transform:translateX(-1.5px)}60%{transform:translateX(1.5px)}100%{transform:translateX(0)}}',
    '.th-now{font-family:"Okie Sora",var(--okie-font);font-size:clamp(17px,calc(var(--th-h) * .085),26px);font-weight:600;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.62);}',
    '.th[data-ranged="true"] .th-num,.th[data-ranged="true"] .th-now{display:none;}',
    '.th-range{display:flex;flex-direction:column;gap:6px;}.th-range .rr{gap:8px;}.th-range .rr span{width:34px;}.th-range .rv{min-width:58px;font-size:24px;font-family:"Okie Sora",var(--okie-font);font-weight:600;}.th-range .stp{width:36px;height:36px;}',
    '.th-bottom{display:flex;flex-direction:column;align-items:flex-start;gap:12px;}',
    '.th-sched{display:flex;align-items:center;gap:7px;width:min(100%,280px);font-size:13px;font-weight:700;color:var(--th-accent);transition:color .4s ease;}.th-sched-ic svg{width:15px;height:15px;display:block;}.th-sched-chev{margin-left:auto;color:rgba(255,255,255,.6);}.th-sched-chev svg{width:14px;height:14px;display:block;}',
    '.th-modes{display:flex;flex-wrap:wrap;gap:6px 8px;}',
    '.th-mode{display:flex;flex-direction:column;align-items:center;gap:5px;width:50px;}',
    '.th-mode-ic{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);color:rgba(255,255,255,.72);transition:background .25s ease,border-color .25s ease,color .25s ease,transform .2s ease;}',
    '.th-mode-ic svg{width:17px;height:17px;}.th-mode:active .th-mode-ic{transform:scale(.92);}',
    // a light: the white presets are circles in their own colour, the colours are small dots under them
    '.th-mode-ic,.th-mode-l,.th-sw{flex:none;}.th-now:empty{display:none;}',
    '.th.light .th-bottom{gap:10px;}.th.light .th-swatches{gap:8px;}.th.light .th-sw{width:26px;height:26px;}',
    '.th-mode.hsw .th-mode-ic{background:var(--sw);border:1px solid rgba(255,255,255,.4);}.th-mode.hsw.active .th-mode-ic{background:var(--sw);border:2px solid #fff;box-shadow:0 0 0 3px rgba(20,18,16,.5);}',
    '.th-swatches{display:flex;flex-wrap:wrap;gap:10px;max-width:100%;}.th-sw{flex:none;width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(255,255,255,.4);padding:0;transition:transform .2s ease;}.th-sw:active{transform:scale(.9);}.th-sw.active{border:2px solid #fff;box-shadow:0 0 0 3px rgba(20,18,16,.5);}',
    '.th-mode-l{font-size:9.5px;font-weight:600;line-height:1.15;text-align:center;color:rgba(255,255,255,.62);transition:color .25s ease;}',
    '.th-mode.active .th-mode-ic{background:var(--th-accent);border-color:var(--th-accent);color:#fff;box-shadow:0 0 0 3px rgba(20,18,16,.5),0 0 0 5px rgba(var(--th-accent-rgb),.8),0 6px 18px -2px rgba(var(--th-accent-rgb),.55);}.th-mode.active .th-mode-l{color:#fff;}',
    '.th-zone{position:absolute;z-index:2;top:0;height:100%;right:0;width:44%;touch-action:none;cursor:ns-resize;outline:none;}.th-zone:focus-visible{box-shadow:inset 0 0 0 2px rgba(255,255,255,.4);border-radius:28px;}',
    '.th-unav{position:absolute;z-index:3;left:18px;right:18px;top:50%;transform:translateY(-50%);pointer-events:none;text-align:center;font-size:13px;font-weight:700;color:rgba(255,255,255,.72);}',
    '.th-offnote{display:none;font-size:12px;font-weight:700;line-height:1.35;color:rgba(255,255,255,.72);max-width:200px;}.th.off .th-offnote{display:block;}.th.off .th-now{display:none;}',
    '.th.off .th-num{opacity:.35;text-shadow:none;}.th.off .th-eyebrow,.th.off .th-now{opacity:.5;}.th.off .th-tick,.th.off .th-glow{opacity:.3;}',
    '.th.off .th-mode.active .th-mode-ic{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.16);color:rgba(255,255,255,.72);box-shadow:none;}',
    '.th.unavail .th-gaugewrap,.th.unavail .th-left{opacity:.3;}.th.unavail .th-left{pointer-events:none;}.th.unavail .th-left button{pointer-events:none;}',
    '.th-foot{position:absolute;z-index:4;right:10px;bottom:8px;display:flex;justify-content:flex-end;}',
    '.th-power{display:flex;align-items:center;gap:7px;padding:8px 12px;border-radius:9999px;background:rgba(0,0,0,.22);touch-action:none;-webkit-user-select:none;user-select:none;}',
    '.th-ring{position:relative;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:var(--th-accent,#ff2d55);}',
    '.th-pic{position:relative;z-index:1;display:grid;place-items:center;}.th-pic svg{width:11px;height:11px;}',
    '.th-prog{position:absolute;inset:0;transform:rotate(-90deg);}.th-prog circle{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-dasharray:107px;stroke-dashoffset:107px;}',
    '.th-power.holding .th-prog circle{transition:stroke-dashoffset 3s linear;stroke-dashoffset:0;}',
    '.th-power-l{font-size:11px;font-weight:700;color:rgba(255,255,255,.72);}',
    // the scrolling area's top edge fades in over 44 px instead of cutting the wheel's shadow and glow in a straight line (phone and wide screens, the Controls tab)
    '.dt[data-dial][data-tab="controls"] .dt-bodyhost{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 44px);mask-image:linear-gradient(to bottom,transparent 0,#000 44px);}',
    '@media (max-width:640px){.dt[data-dial][data-tab="controls"] .dt-bodyhost{-webkit-mask-image:linear-gradient(to bottom,transparent 0,rgba(0,0,0,.55) 18px,#000 52px);mask-image:linear-gradient(to bottom,transparent 0,rgba(0,0,0,.55) 18px,#000 52px);}}',
    // phones: no card inside the blurred glass, the same as on a wide screen: the dial fills the whole glass under the tab bar, edge to edge and down to the bottom (the glass clips it
    // with its own rounded corners). Above it sit the hero 170, the tab bar's padding 14 + height 50 and its gap 16 = 250 px. Never shorter than 340 px (the page scrolls on a short
    // phone). The original project's proportions, in our own look: a big number (about 45 % of the width), the schedule link and the three modes under it, "Hold to turn off" centred at
    // the bottom, the wheel on the right (see place()).
    // the design's layout at every width: a phone shows the same glass column as a wide screen (the user's call: 'the same in the phone view')
    '.dt[data-dial]{container-type:size;}',
    // The wide layout of the design (Figma "Okie Thermostat – editable frame", card 1101 x 740): the number in the middle of the column, the schedule link and the
    // three modes under it, "Hold to turn off" centred at the bottom, a big wheel that starts 80 px under the top of the card and ends 25 px above its bottom.
    '.th{--th-num:clamp(84px,calc((var(--th-ch,100cqh) - 108px) * .176),140px);min-height:520px;overflow:visible;}',
    '.th{height:calc(var(--th-ch,100cqh) - 108px);}.th-gaugewrap,.th-zone{top:-7.5px;height:calc(var(--th-ch,100cqh) - 105.5px);}',
    '.th-title{display:block;position:absolute;left:24px;top:-3px;z-index:3;pointer-events:none;}.th-step{margin-top:6px;}.th-stp{width:44px;height:44px;font-size:24px;}',
    // top gap (a quarter of the height, the design) | readout | free space | schedule, modes: the gap gives way when the card is short, so nothing can run into the block under it
    '.th-left{left:0;right:0;top:0;bottom:0;width:auto;padding:0 0 0 24px;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,calc((var(--th-ch,100cqh) - 108px) * .25)) auto minmax(14px,1fr) auto;align-content:start;}',
    '.th-readout{grid-row:2;margin-top:0;}.th-bottom{grid-row:4;}',
    '.th-readout{gap:13px;}.th-eyebrow{font-size:15px;letter-spacing:1px;}.th-num{font-size:var(--th-num);}.th.dec .th-num{font-size:calc(var(--th-num) * .72);}.th .th-num[data-len="3"]{font-size:calc(var(--th-num) * .76);}',
    '.th-now{font-family:"Okie Manrope",var(--okie-font);font-size:15px;font-weight:600;color:rgba(255,255,255,.62);margin-top:calc(var(--th-num) * -.07 - 13px);}',
    '.th-bottom{margin-top:0;margin-bottom:52px;gap:20px;}',
    '.th-sched{width:min(100%,250px);letter-spacing:-.06em;}.th-sched-ic svg{width:22px;height:22px;}',
    '.th-modes{gap:12px;flex-wrap:nowrap;}.th-mode{width:auto;min-width:50px;gap:8px;overflow:visible;}.th-mode-l{font-size:11px;white-space:nowrap;}',
    '.th-mode-ic{width:50px;height:50px;}.th-mode-ic svg{width:20px;height:20px;}',
    '.th-mode.active .th-mode-ic{background:radial-gradient(circle closest-side,var(--th-accent) 0,var(--th-accent) 78%,transparent 80%);border:2px solid rgba(var(--th-accent-rgb),.85);box-shadow:none;}',
    '.dt[data-dial][data-tab="controls"] .dt-menu{position:relative;z-index:3;}.dt[data-dial][data-tab="controls"] .dt-bodyhost{margin-top:-48px;}.dt[data-dial][data-tab="controls"] .dt-body{padding-top:52px;}',      // the body's clipped edge sits behind the tab bar: the wheel's glow is not cut off in a line right under it
    '.dt[data-dial][data-tab="controls"] .dt-main{padding-right:0;}.dt[data-dial][data-tab="controls"] .dt-bar{margin-right:20px;}.dt[data-dial][data-tab="controls"] .dt-body{padding-right:0;}',      // the wheel is clipped by the scrolling area: no padding at its right, so it runs to the edge of the card
    '.th-foot{left:0;right:28px;bottom:0;justify-content:center;}.th-power{background:none;padding:0;gap:9px;}.th-power-l{font-size:13px;}',
    // a phone: the glass sits under the picture; the tab bubble is centred and the column may be a bit shorter
    '@media (max-width:640px){.dt[data-dial][data-tab="controls"] .dt-main{padding:14px 0 0;}.dt[data-dial][data-tab="controls"] .dt-bar{margin-right:0;}.dt[data-dial][data-tab="controls"] .dt-body{padding-left:0;padding-bottom:0;}.th{min-height:430px;height:calc(var(--th-ch,100cqh) - 79px);}.th-gaugewrap,.th-zone{height:calc(var(--th-ch,100cqh) - 67.5px);}.th-foot{right:0;}.th-bottom{margin-bottom:40px;}.th-sched{width:min(100%,236px);}.th-gaugewrap{overflow:hidden;-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 46px);mask-image:linear-gradient(to bottom,transparent 0,#000 46px);}}',
    '.thl{display:flex;flex-direction:column;gap:12px;align-self:stretch;font-family:"Okie Manrope",var(--okie-font);}',
    '.thl-hint{font-size:13px;line-height:1.45;color:var(--okie-text-dim);margin-top:-4px;}.thl-marks{position:relative;height:16px;margin:-6px 7px 2px;}.thl-mk{position:absolute;top:0;transform:translateX(-50%);font-size:11.5px;font-weight:600;color:var(--okie-text-dim);white-space:nowrap;font-variant-numeric:tabular-nums;}.thl-mk.l{transform:none;}.thl-mk.r{transform:translateX(-100%);}',
    // the Dials preview of the main Settings
    '.dlp{border-radius:24px;padding:16px 14px 14px;background:linear-gradient(160deg,rgba(18,16,15,.78),rgba(34,30,27,.62));box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);display:flex;flex-direction:column;gap:12px;overflow:hidden;}',
    '.dlp-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end;}.dlp-cell{display:flex;flex-direction:column;align-items:center;gap:10px;min-width:0;}',
    '.dlp-art{height:148px;width:100%;display:grid;place-items:center;position:relative;}',
    '.dlp-wheelbox{position:relative;width:138px;height:138px;--th-accent:#ff962d;color:#f6f5f7;}.dlp-wheel{position:absolute;inset:0;}.dlp-wheel svg{position:static;width:100%;height:100%;display:block;overflow:visible;}',
    '.dlp-num{position:absolute;inset:0;display:grid;place-items:center;font-family:"Okie Sora",var(--okie-font);font-size:30px;font-weight:700;letter-spacing:-.02em;pointer-events:none;text-shadow:0 2px 14px rgba(0,0,0,.45);}',
    '.dlp .dial{margin:0 auto;}.dlp .dial-val{font-size:26px;}.dlp .dial-lbl{display:none;}.dlp .slider{height:40px;width:100%;flex:none;}',
    '.dlp-cap{display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;}.dlp-cap b{font-size:13.5px;font-weight:650;}.dlp-cap span{font-size:11.5px;color:var(--okie-text-dim);}',
    '.dlp-hint{font-size:12.5px;color:var(--okie-text-dim);text-align:center;}@media (max-width:420px){.dlp-grid{grid-template-columns:1fr 1fr;}.dlp-cell.c-slider{grid-column:1/-1;}}',,
    '.thl-sec{margin-top:6px;font-size:12px;color:var(--okie-text-dim);text-transform:uppercase;letter-spacing:.08em;}',
    '.thl-row{display:flex;align-items:center;gap:14px;}.thl-l{flex:0 0 130px;font-size:14px;}.thl-row .slider{flex:1;min-width:120px;height:36px;}',
    '.thl-bar{height:14px;border-radius:9999px;}',
    '.thl-cols{display:flex;gap:18px;flex-wrap:wrap;}.thl-c{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;}',
    '.thl-color{width:34px;height:34px;padding:0;border:0;border-radius:50%;background:none;cursor:pointer;}.thl-color::-webkit-color-swatch-wrapper{padding:0;}.thl-color::-webkit-color-swatch{border:2px solid rgba(255,255,255,.45);border-radius:50%;}.thl-color::-moz-color-swatch{border:2px solid rgba(255,255,255,.45);border-radius:50%;}',
    '@media (prefers-reduced-motion:reduce){.th-tick,.th-mode-ic,.th-prog circle{transition:none !important;}.th-num.buzz{animation:none;}}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  g.OkieMotor.layoutInfo = function () { var l = g.OkieMotor.thermoLayout; return l ? [l.win, 'card ' + l.card, 'dial ' + l.dial, 'wheel ' + l.wheel + ' x' + l.scale].join(' · ') : 'open a thermostat first'; };
  g.OkieMotor.thermo = Object.assign({ create: create, buildWheel: buildWheel, lookPanel: lookPanel, dialPreview: dialPreview, CSS: CSS }, pureApi);
})(typeof globalThis !== 'undefined' ? globalThis : window);
