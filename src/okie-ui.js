/* okie-ui: DOM helper, icon set, glass design tokens, gestures, scrollbar.
 *
 * The icon set is our own (24x24 line icons), so the cards do not depend on mdi
 * being resolvable and look the same inside and outside Home Assistant.
 * Tokens are CSS custom properties with FSC-style defaults; a Hemma theme can
 * override any of them (they read --hemma-* where an equivalent exists).
 */
(function (g) {
  'use strict';

  // ------------------------------------------------------------ h() ----
  /** h('div.cls#id', {onclick, style:{}, dataset:{}}, ...children) */
  function h(sel, props) {
    var m = /^([a-z0-9-]*)((?:[.#][^.#]+)*)$/i.exec(sel);
    var tag = (m && m[1]) || 'div';
    var el = document.createElement(tag);
    if (m && m[2]) {
      m[2].replace(/([.#])([^.#]+)/g, function (_, k, v) { if (k === '.') el.classList.add(v); else el.id = v; });
    }
    var start = 1;
    if (props && typeof props === 'object' && !Array.isArray(props) && !(props.nodeType) && typeof props !== 'string') {
      start = 2;
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (n) { if (n.slice(0, 2) === '--') el.style.setProperty(n, v[n]); else el.style[n] = v[n]; });      // (a custom property like --ec needs setProperty; assigning it does nothing)
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
        else if (k in el && k !== 'list' && k !== 'form') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = start; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { append(el, x); });
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }

  // ----------------------------------------------------------- icons ----
  var S = function (inner) { return inner; };
  var ICONS = {
    code: S('<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"/>'),
    tips: S('<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M19.5 3.5v4h-4"/><path d="M12 8.2l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z"/>'),
    newsbook: S('<rect x="4" y="4" width="13" height="16" rx="2"/><path d="M17 8h3v10a2 2 0 0 1-2 2M7.5 8.5h6M7.5 12h6M7.5 15.5h4"/>'),
    checklist: S('<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.3 1.3L7 4.8M3.5 12l1.3 1.3L7 10.8M3.5 18l1.3 1.3L7 16.8"/>'),
    calclock: S('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="16" cy="16" r="2.4"/>'),
    calgear: S('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    orb: S('<path d="M17.6 6.4A8 8 0 1 0 20 12"/><circle cx="19" cy="5" r="1.8"/>'),
    filterlines: S('<path d="M4 7h16M7 12h10M10 17h4"/>'),
    tag: S('<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/>'),
    info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    warn: S('<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5h.01"/>'),
    bang: S('<path d="M12 4v10.5M12 19h.01" stroke-width="2.4"/>'),
    pulse: S('<path d="M3 12h4l2.2-6 4 12 2.2-6H21"/>'),
    folder: S('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    folderset: S('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13.5" r="2"/>'),
    windowset: S('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18"/><circle cx="16.5" cy="15.5" r="2"/>'),
    userc: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.2a6.5 6.5 0 0 1 11 0"/>'),
    chevleft: S('<path d="M15 5l-7 7 7 7"/>'),
    star: S('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>'),
    recent: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    homeroom: S('<path d="M4 11l8-7 8 7M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>'),
    snowflake: S('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.8L12 7l2.5-2.2M9.5 19.2L12 17l2.5 2.2"/>'),
    bulb: S('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
    plug: S('<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4"/>'),
    toggle: S('<rect x="3" y="7" width="18" height="10" rx="5"/><circle cx="8.5" cy="12" r="2.5"/>'),
    thermostat: S('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v6"/>'),
    blinds: S('<rect x="4" y="3" width="16" height="3" rx="1"/><path d="M4 10h16M4 14h16M4 18h16M12 18v3"/>'),
    lock: S('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2"/>'),
    unlock: S('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2M12 15v2"/>'),
    tv: S('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>'),
    speaker: S('<rect x="6" y="3" width="12" height="18" rx="2.5"/><circle cx="12" cy="14" r="3"/><circle cx="12" cy="7.5" r=".6"/>'),
    fan: S('<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2C12 6 13 3 15.5 3S17 7 12 10.2zM13.8 12C18 12 21 13 21 15.5S17 17 13.8 12zM12 13.8C12 18 11 21 8.5 21S7 17 12 13.8zM10.2 12C6 12 3 11 3 8.5S7 7 10.2 12z"/>'),
    eye: S('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    motion: S('<circle cx="12" cy="12" r="2"/><path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15"/>'),
    camera: S('<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3z"/>'),
    vacuum: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3"/>'),
    scene: S('<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.5-2.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="10" cy="7.5" r=".8"/><circle cx="14" cy="7.5" r=".8"/>'),
    script: S('<path d="M8 3h8l3 3v15H5V6zM9 11h6M9 15h6"/>'),
    bolt: S('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
    server: S('<rect x="3" y="3.5" width="18" height="7" rx="2"/><rect x="3" y="13.5" width="18" height="7" rx="2"/><path d="M7 7h.01M7 17h.01"/>'),
    cloud: S('<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9H7z"/>'),
    sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: S('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>'),
    rain: S('<path d="M7 15a4 4 0 0 1-.5-8A6 6 0 0 1 18 6a4.5 4.5 0 0 1 0 9H7zM8 19l-1 2M12 19l-1 2M16 19l-1 2"/>'),
    shield: S('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'),
    person: S('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    home: S('<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>'),
    search: S('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    filter: S('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    gear: S('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
    calendar: S('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    pin: S('<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    notefill: S('<path fill="currentColor" stroke="none" d="M19 3.300v12.300a3.200 3.200 0 1 1-2-2.950V8.200L9.500 9.700v8.200a3.200 3.200 0 1 1-2-2.950V6.200z"/>'),
    rewind: S('<path fill="currentColor" stroke="none" d="M11.500 5.500v13L2 12zM22 5.500v13L12.500 12z"/>'),
    ffwd: S('<path fill="currentColor" stroke="none" d="M12.500 5.500v13L22 12zM2 5.500v13L11.500 12z"/>'),
    pausefill: S('<rect fill="currentColor" stroke="none" x="5.500" y="3.500" width="5" height="17" rx="1.300"/><rect fill="currentColor" stroke="none" x="13.500" y="3.500" width="5" height="17" rx="1.300"/>'),
    playfill: S('<path fill="currentColor" stroke="none" d="M6.500 3.800v16.400L20.500 12z"/>'),
    music: S('<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'),
    quote: S('<path d="M4 4.5h16a1.5 1.5 0 0 1 1.5 1.5v9.500A1.500 1.500 0 0 1 20 17H9.500L5 20.500V17H4a1.500 1.500 0 0 1-1.500-1.500V6A1.500 1.500 0 0 1 4 4.500z"/><path d="M8.500 12.500c0-1.500.5-2.500 1.800-3M13.500 12.500c0-1.500.5-2.500 1.800-3"/>'),
    shuffle: S('<path d="M3 7h3c3 0 4.500 2 6 5s3 5 6 5h3M21 17l-3-3M21 17l-3 3M3 17h3c1.500 0 2.700-.8 3.800-2M14 8.300C15 7.500 16 7 18 7h3M21 7l-3-3M21 7l-3 3"/>'),
    repeat: S('<path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3"/>'),
    cast: S('<path d="M5 17H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1"/><path d="M12 15l5 6H7z"/>'),
    key: S('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>'),
    book: S('<path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14"/>'),
    film: S('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'),
    flow: S('<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/>'),
    tablet: S('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M11 18h2"/>'),
    doorbell: S('<rect x="7" y="3" width="10" height="18" rx="3"/><circle cx="12" cy="9" r="1.6"/><circle cx="12" cy="15" r="1.1"/>'),
    note: S('<path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 13h7M8.5 17h4"/>'),
    list: S('<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>'),
    news: S('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
    close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
    back: S('<path d="M15 5l-7 7 7 7"/>'),
    chevron: S('<path d="M9 5l7 7-7 7"/>'),
    chevdown: S('<path d="M5 9l7 7 7-7"/>'),
    heart: S('<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>'),
    clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    drop: S('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
    power: S('<path d="M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0"/>'),
    grid: S('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
    rows: S('<rect x="4" y="5" width="16" height="5" rx="1.5"/><rect x="4" y="14" width="16" height="5" rx="1.5"/>'),
    bell: S('<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 0 0 4 0"/>'),
    more: S('<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>'),
    check: S('<path d="M5 12l5 5 9-10"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    minus: S('<path d="M5 12h14"/>'),
    play: S('<path d="M8 5l11 7-11 7z"/>'),
    pause: S('<path d="M9 5v14M15 5v14" stroke-width="3"/>'),
    next: S('<path d="M6 5l9 7-9 7zM18 5v14"/>'),
    prev: S('<path d="M18 5l-9 7 9 7zM6 5v14"/>'),
    volume: S('<path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7"/>'),
    mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    flame: S('<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>'),
    snow: S('<path d="M12 3v18M4 7.5l16 9M4 16.5l16-9"/>'),
    wind: S('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>'),
    garage: S('<path d="M3 21V9l9-5 9 5v12M7 21v-7h10v7M7 17h10"/>'),
    door: S('<rect x="6" y="3" width="12" height="18" rx="1.5"/><circle cx="15" cy="12.5" r=".8"/>'),
    window: S('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M12 3v18M4 12h16"/>'),
    battery: S('<rect x="3" y="8" width="16" height="9" rx="2"/><path d="M21 11v3"/>'),
    gauge: S('<path d="M4 17a8 8 0 1 1 16 0M12 17l4-5"/>'),
    chart: S('<path d="M4 20V4M4 20h16M8 15l3-4 3 2 4-6"/>'),
    sliders: S('<path d="M5 4v16M12 4v16M19 4v16"/><circle cx="5" cy="14" r="2"/><circle cx="12" cy="8" r="2"/><circle cx="19" cy="16" r="2"/>'),
    spark: S('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
    expand: S('<path d="M15 3h6v6M9 21H3v-6M21 3l-7.5 7.5M3 21l7.5-7.5"/>'),
    pencil: S('<path d="M4 20l1.2-4.4L16.6 4.2a2.1 2.1 0 0 1 3 3L8.2 18.8 4 20z"/><path d="M14.6 6.2l3.2 3.2"/>'),
    refresh: S('<path d="M20 5v5h-5M4 19v-5h5M5.6 9A7 7 0 0 1 19 8M18.4 15A7 7 0 0 1 5 16"/>'),
    trash: S('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    image: S('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>'),
  };

  function icon(name, size, extra) {
    var inner = ICONS[name] || ICONS.eye;
    var s = size || 24;
    return '<svg class="oi' + (extra ? ' ' + extra : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  function iconEl(name, size, extra) {
    var w = document.createElement('span');
    w.className = 'oi-wrap';
    w.style.cssText = 'display:inline-flex;line-height:0;';
    w.innerHTML = icon(name, size, extra);
    return w;
  }

  /** Which icon for which entity. */
  function domainIcon(domain, deviceClass, state) {
    switch (domain) {
      case 'light': return 'bulb';
      case 'switch': return deviceClass === 'outlet' ? 'plug' : 'toggle';
      case 'input_boolean': return 'toggle';
      case 'climate': return 'thermostat';
      case 'cover': return deviceClass === 'garage' || deviceClass === 'gate' ? 'garage' : 'blinds';
      case 'lock': return state === 'unlocked' ? 'unlock' : 'lock';
      case 'media_player': return deviceClass === 'speaker' ? 'speaker' : 'tv';
      case 'fan': return 'fan';
      case 'camera': return 'camera';
      case 'vacuum': return 'vacuum';
      case 'scene': return 'scene';
      case 'script': return 'script';
      case 'automation': return 'bolt';
      case 'weather': return state === 'rainy' || state === 'pouring' ? 'rain' : (state === 'clear-night' ? 'moon' : (state === 'sunny' ? 'sun' : 'cloud'));
      case 'alarm_control_panel': return 'shield';
      case 'person': case 'device_tracker': return 'person';
      case 'humidifier': return 'drop';
      case 'water_heater': return 'flame';
      case 'siren': return 'bell';
      case 'binary_sensor':
        if (deviceClass === 'door' || deviceClass === 'garage_door') return 'door';
        if (deviceClass === 'window') return 'window';
        if (deviceClass === 'smoke' || deviceClass === 'safety' || deviceClass === 'gas') return 'bell';
        return 'motion';
      case 'sensor':
        if (deviceClass === 'temperature') return 'thermostat';
        if (deviceClass === 'humidity') return 'drop';
        if (deviceClass === 'battery') return 'battery';
        if (deviceClass === 'power' || deviceClass === 'energy') return 'bolt';
        if (deviceClass === 'pressure') return 'gauge';
        return 'eye';
      default: return 'eye';
    }
  }

  // ------------------------------------------------------- base CSS ----
  // One stylesheet string every okie element prepends to its shadow root.
  var BASE_CSS = [
    ':host{',
    ' -webkit-text-size-adjust:100%;text-size-adjust:100%;',      // iPad / iPhone Safari must not enlarge small text on its own (it made labels run into each other)
    ' --okie-text:rgba(255,255,255,.95);',
    ' --okie-text-dim:rgba(255,255,255,.7);',
    ' --okie-text-faint:rgba(255,255,255,.45);',
    ' --glass-blur-amount:20px;',
    ' --glass-backdrop:blur(calc(var(--glass-blur-amount,20px) + var(--background-blur,0px))) saturate(var(--okie-saturate,1.8)) brightness(var(--background-brightness,100%)) contrast(var(--background-contrast,100%)) grayscale(var(--background-grayscale,0%));',
    ' --glass-tint-bg:radial-gradient(circle at 50% 0%,hsla(0,0%,100%,.08),hsla(0,0%,100%,.03) 70%),rgba(30,30,30,var(--glass-tint-alpha,.4));',
    ' --glass-border-color:hsla(0,0%,100%,.2);',
    ' --glass-shadow:0 8px 32px rgba(0,0,0,.1);',
    ' --okie-glass:rgba(30,30,30,.4);',
    ' --okie-glass-strong:rgba(28,28,30,.92);',
    ' --okie-popup-backdrop:blur(calc((var(--glass-blur-amount,20px) + var(--background-blur,0px)) * 1.7)) saturate(calc(var(--okie-saturate,1.8) * 1.0556)) brightness(var(--background-brightness,100%)) contrast(var(--background-contrast,100%)) grayscale(var(--background-grayscale,0%));',
    ' --okie-glass-blur:var(--glass-backdrop);',
    ' --okie-tile:var(--okie-card-bg,rgba(255,255,255,.1));',
    ' --okie-tile-hover:rgba(255,255,255,.18);',
    ' --okie-tile-on:#fff;',
    ' --okie-tile-on-text:#1d1b19;',
    ' --okie-accent:#007aff;',
    ' --okie-danger:#ff3b30;',
    ' --okie-warn:#ff9f0a;',
    ' --okie-line:rgba(255,255,255,.1);',
    ' --okie-radius:35px;',
    ' --okie-tile-radius:24px;',
    ' --okie-font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    ' --okie-tile-clip:none;',
    ' --zen-ease:cubic-bezier(.22,1,.36,1);',
    ' color:var(--okie-text);font-family:var(--okie-font);',
    ' -webkit-font-smoothing:antialiased;',
    '}',
    '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}',
    '[hidden]{display:none!important;}',
    'button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;touch-action:manipulation;}',
    '',
    'button,[role=button]{transition:transform .08s cubic-bezier(.16,1,.3,1);}',
    'input{font:inherit;color:inherit;}',
    '.glass,.glass-panel{background:var(--glass-tint-bg);-webkit-backdrop-filter:var(--glass-backdrop);backdrop-filter:var(--glass-backdrop);border:0;box-shadow:var(--glass-shadow);}',
    '.glass-panel{border-radius:35px;overflow:hidden;position:relative;}',
    '.oi{display:block;}',
    '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}',
    ':focus{outline:none;}',
    ':focus-visible{outline:2px solid #fff;outline-offset:2px;}',
    '@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important;}}',
    // custom scrollbar: fixed 80px track, fades in on scroll
    '.okie-scroll{overflow:auto;scrollbar-width:none;-ms-overflow-style:none;}',
    '.okie-scroll::-webkit-scrollbar{display:none;}',
    '.okie-sb{position:absolute;right:4px;width:4px;height:80px;border-radius:2px;pointer-events:none;opacity:0;transition:opacity .25s ease;z-index:1;}',
    '.eb{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:14px 16px;border-radius:18px;background:rgba(239,77,58,.16);font-size:14px;}.eb.c{padding:8px 10px;font-size:12px;border-radius:14px;}',
    '.eb-retry{padding:6px 14px;border-radius:9999px;background:#fff;color:#1d1b19;font-weight:600;font-size:13px;flex:none;}',
    '.okie-sb>i{position:absolute;left:0;width:100%;border-radius:2px;background:var(--hemma-scrollbar-thumb,rgba(255,255,255,.45));}',
  ].join('\n');

  // ---------------------------------------------------- scrollbar ----
  /**
   * attachScrollbar(scrollEl, hostEl): draws an 80px track beside scrollEl.
   * hostEl must be position:relative and a sibling container of scrollEl.
   * Returns { update, destroy }. Always visible on touch (hover:none).
   */
  function attachScrollbar(scrollEl, hostEl) {
    var isTouch = !!(g.matchMedia && g.matchMedia('(hover: none) and (pointer: coarse)').matches);
    var track = h('div.okie-sb', null, h('i'));
    var thumb = track.firstChild;
    hostEl.appendChild(track);
    var timer = 0, ro = null;
    function update() {
      var max = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (max <= 1) { track.style.opacity = '0'; return; }
      var len = Math.max(18, 80 * Math.min(1, scrollEl.clientHeight / scrollEl.scrollHeight));
      thumb.style.height = len + 'px';
      thumb.style.top = ((scrollEl.scrollTop / max) * (80 - len)) + 'px';
      var top = scrollEl.offsetTop + Math.max(0, (scrollEl.clientHeight - 80) / 2);
      track.style.top = top + 'px';
      track.style.opacity = '1';
      clearTimeout(timer);
      if (!isTouch) timer = setTimeout(function () { track.style.opacity = '0'; }, 900);
    }
    scrollEl.addEventListener('scroll', update, { passive: true });
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(update); ro.observe(scrollEl); }
    // async-loaded content: re-measure when children change
    var mo = typeof MutationObserver === 'function' ? new MutationObserver(function () { requestAnimationFrame(update); }) : null;
    if (mo) mo.observe(scrollEl, { childList: true, subtree: true });
    requestAnimationFrame(update);
    return { update: update, destroy: function () { clearTimeout(timer); if (ro) ro.disconnect(); if (mo) mo.disconnect(); track.remove(); } };
  }

  // ----------------------------------------------------- gestures ----
  /**
   * onTapOrHold(el, { tap, hold, holdMs, onProgress })
   * - tap fires on a quick release
   * - if `hold` is given, holding for holdMs fires hold (once) and suppresses tap
   * Pointer events, so it works for mouse, touch and pen. Returns detach().
   */
  function onTapOrHold(el, o) {
    var holdMs = o.holdMs || 1000;
    var timer = 0, raf = 0, t0 = 0, fired = false, active = false, sx = 0, sy = 0;
    function reset() { clearTimeout(timer); cancelAnimationFrame(raf); active = false; if (o.onProgress) o.onProgress(0); }
    function tick() {
      if (!active) return;
      if (o.onProgress) o.onProgress(Math.min(1, (performance.now() - t0) / holdMs));
      raf = requestAnimationFrame(tick);
    }
    function down(e) {
      if (e.button != null && e.button !== 0) return;
      e.stopPropagation();
      active = true; fired = false; t0 = performance.now(); sx = e.clientX; sy = e.clientY;
      if (o.hold) {
        timer = setTimeout(function () {
          fired = true; active = false; cancelAnimationFrame(raf);
          if (o.onProgress) o.onProgress(1);
          if (g.navigator && navigator.vibrate) { try { navigator.vibrate(15); } catch (er) {} }
          o.hold(e);
          setTimeout(function () { if (o.onProgress) o.onProgress(0); }, 250);
        }, holdMs);
        raf = requestAnimationFrame(tick);
      }
    }
    function up(e) {
      e.stopPropagation();
      if (!active) return;
      var moved = Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10;
      var wasFired = fired;
      reset();
      if (!wasFired && !moved && o.tap) o.tap(e);
    }
    function cancel() { reset(); }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('click', function (e) { e.stopPropagation(); });
    el.addEventListener('contextmenu', function (e) { if (o.hold) e.preventDefault(); });
    return function detach() { cancel(); el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); };
  }

  /**
   * Error boundary: build() throws -> a quiet fallback with a retry button replaces just that piece,
   * everything around it keeps working. o: { label, text, retry (label), compact }
   */
  function guard(build, o) {
    o = o || {};
    try { return build(); }
    catch (e) {
      if (g.console) console.error('[okie] ' + (o.label || 'render') + ' failed', e);
      var box = h('div.eb' + (o.compact ? '.c' : ''), { role: 'alert' }, h('span', null, o.text || 'Something went wrong here.'),
        h('button.eb-retry', { onclick: function () { var fresh = guard(build, o); if (box.parentNode) box.replaceWith(fresh); } }, o.retry || 'Retry'));
      return box;
    }
  }

  function debounce(fn, ms) {
    var t = 0;
    var d = function () { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); };
    d.cancel = function () { clearTimeout(t); };
    return d;
  }

  /** rAF-batched updater: many calls per frame collapse to one run. */
  function rafBatch(fn) {
    var pending = false;
    return function () { if (pending) return; pending = true; requestAnimationFrame(function () { pending = false; fn(); }); };
  }

  /**
   * Does this engine report a zoomed element's rectangle at its layout size (true) instead of the size it has on screen (false)?
   * boundW = what getBoundingClientRect says about the zoomed column, layoutW = its offsetWidth, z = the CSS zoom it carries.
   * Chrome, Firefox and current Safari scale the rectangle with the zoom; older Safari does not (WebKit bug 77998), and a pointer is
   * measured in screen pixels, so against the unscaled rectangle a slider or dial lands in the wrong place.
   */
  function reportsUnzoomed(boundW, layoutW, z) {
    if (!(z > 0) || z === 1 || !(layoutW > 0)) return false;
    return Math.abs(boundW - layoutW) < Math.abs(boundW - layoutW * z);
  }
  /** The nearest ancestor (through shadow roots) that carries a CSS zoom other than 1: the card's column. */
  function zoomRoot(el) {
    for (var n = el; n; n = n.parentNode || n.host) {
      if (n.nodeType === 1 && n.style && n.style.zoom) { var z = parseFloat(n.style.zoom); if (z > 0 && z !== 1) return n; }
    }
    return null;
  }
  /** getBoundingClientRect in the pixels of a pointer event's clientX / clientY, whichever way the engine handles CSS zoom. */
  function screenRect(el) {
    var r = el.getBoundingClientRect(), zr = zoomRoot(el);
    if (!zr) return r;
    var z = parseFloat(zr.style.zoom);
    if (!reportsUnzoomed(zr.getBoundingClientRect().width, zr.offsetWidth, z)) return r;
    return { left: r.left * z, top: r.top * z, right: r.right * z, bottom: r.bottom * z, width: r.width * z, height: r.height * z };
  }

  /**
   * A light tick on iPhones. They have no vibration call for web pages, but WebKit gives a haptic when a switch control is toggled (iOS 17.4 and newer), so a hidden switch is
   * clicked for it. Returns whether the click went out; it cannot know whether the phone then ticked.
   */
  var tickLabel = null;
  function tick() {
    try {
      if (!tickLabel) {
        var l = document.createElement('label'), i = document.createElement('input');
        i.type = 'checkbox'; i.setAttribute('switch', ''); l.appendChild(i); l.setAttribute('aria-hidden', 'true'); l.setAttribute('data-okie-haptic', ''); l.style.display = 'none';
        (document.head || document.documentElement).appendChild(l); tickLabel = l;
      }
      tickLabel.click(); return true;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- pull to open ----
  var PULL_AT = 0.55;
  /** pullProgress(dx, max) -> 0..1: how far the round button has been pulled along its pill. */
  function pullProgress(dx, max) { return max > 0 ? Math.max(0, Math.min(1, dx / max)) : 0; }
  /** pullOpens(p): let go past the middle and the pill opens; before it the round button springs back. */
  function pullOpens(p) { return p >= PULL_AT; }

  /**
   * pullPill(pill, open): the round button of a pill ("View Cameras") can be pulled to the right to open it. The button slides with the finger and turns, a light fills the track behind it,
   * the word drifts away, spreads and blurs. Let go past the middle: the button runs to the end, turns once more and opens. A tap on the pill opens as before.
   */
  function pullPill(pill, open) {
    var knob = pill.querySelector('.cam-pill-ic'), word = knob ? knob.nextElementSibling : null, svg = knob ? knob.querySelector('svg') : null;
    var st = null, swallow = false, swallowT = 0;
    pill.addEventListener('click', function (e) { e.stopPropagation(); if (swallow) { e.preventDefault(); return; } open(); });
    if (!knob) return;
    function zoom() { var zr = zoomRoot(pill); return zr ? (parseFloat(zr.style.zoom) || 1) : 1; }
    function paint(p, dx, turn) {
      pill.style.setProperty('--pull', p.toFixed(3));
      knob.style.transform = p || dx ? 'translateX(' + dx.toFixed(1) + 'px)' : '';
      if (svg) svg.style.transform = p || turn ? 'rotate(' + (turn != null ? turn : p * 180).toFixed(1) + 'deg)' : '';
      if (word) {
        word.style.opacity = p ? String(1 - 0.85 * p) : ''; word.style.transform = p ? 'translateX(' + (p * 18).toFixed(1) + 'px)' : '';
        word.style.letterSpacing = p ? (0.01 + p * 0.12).toFixed(3) + 'em' : ''; word.style.filter = p > 0.02 ? 'blur(' + (p * 2.5).toFixed(1) + 'px)' : '';
      }
    }
    function snap(ms) { pill.classList.add('pull-snap'); setTimeout(function () { pill.classList.remove('pull-snap'); }, ms); }
    knob.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      st = { id: e.pointerId, x: e.clientX, z: zoom(), max: Math.max(1, pill.offsetWidth - knob.offsetWidth - 14), p: 0, dx: 0 };
      pill.classList.remove('pull-snap'); pill.classList.add('pulling');
      try { knob.setPointerCapture(e.pointerId); } catch (er) { /* the moves still arrive */ }
    });
    knob.addEventListener('pointermove', function (e) {
      if (!st || e.pointerId !== st.id) return;
      var dx = Math.max(0, (e.clientX - st.x) / st.z); st.dx = Math.min(dx, st.max); st.p = pullProgress(dx, st.max);
      if (dx > 4) { swallow = true; clearTimeout(swallowT); }
      paint(st.p, st.dx);
    });
    function end(e, cancel) {
      if (!st || e.pointerId !== st.id) return;
      var s = st; st = null; pill.classList.remove('pulling');
      clearTimeout(swallowT); swallowT = setTimeout(function () { swallow = false; }, 400);      // the click that follows a pull must not open it twice
      if (!cancel && pullOpens(s.p)) {
        snap(700); paint(1, s.max, 360);
        setTimeout(function () { open(); setTimeout(function () { snap(400); paint(0, 0); }, 500); }, 230);
      } else if (s.dx > 0) { snap(360); paint(0, 0); }
    }
    knob.addEventListener('pointerup', function (e) { end(e, false); });
    knob.addEventListener('pointercancel', function (e) { end(e, true); });
  }

  var api = {
    pullPill: pullPill, pullProgress: pullProgress, pullOpens: pullOpens,
    tick: tick, h: h, icon: icon, iconEl: iconEl, ICONS: ICONS, domainIcon: domainIcon, BASE_CSS: BASE_CSS,
    attachScrollbar: attachScrollbar, onTapOrHold: onTapOrHold, debounce: debounce, rafBatch: rafBatch, guard: guard,
    snapHero: function (pc) { var S = [30, 36, 42, 52, 62], b = S[0]; S.forEach(function (v) { if (Math.abs(v - pc) < Math.abs(b - pc)) b = v; }); return b === 42 ? 0 : b; },      // the picture of a screen snaps to five widths; 0 is the normal one
    screenRect: screenRect, reportsUnzoomed: reportsUnzoomed,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.ui = api; }
})(typeof globalThis !== 'undefined' ? globalThis : window);
