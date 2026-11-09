/* okie-icons: the coloured device icons on the tiles. Hand-drawn here (not FSC's):
 * a blue pill switch with a green dot, an amber bulb, a blue TV, a cyan snowflake
 * chip, green blinds, ... When a tile is on (white) they are coloured; when it is
 * off (glass) they fall back to soft white strokes. A few loop (fan, vacuum) and
 * the rest are static, so the GPU stays quiet.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var UI = isNode ? null : g.OkieMotor.ui;

  var OFF = 'rgba(255,255,255,.62)';          // stroke on a glass tile
  function sv(size, inner, extra) {
    return '<svg class="oi rich' + (extra ? ' ' + extra : '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  /** Which family of icon an entity gets. Pure, tested. */
  function kind(domain, deviceClass, state, attrs) {
    switch (domain) {
      case 'switch': case 'input_boolean': return deviceClass === 'outlet' ? 'outlet' : 'toggle';
      case 'light': return 'light';
      case 'gadget': return deviceClass === 'light' ? 'light' : 'tv';
      case 'media_player': return deviceClass === 'speaker' || deviceClass === 'receiver' ? 'speaker' : 'tv';
      case 'climate': return (state === 'cool') ? 'snow' : (state === 'heat' ? 'flame' : 'thermo');
      case 'cover': return deviceClass === 'garage' || deviceClass === 'gate' ? 'garage' : 'blinds';
      case 'fan': return 'fan';
      case 'vacuum': return 'vacuum';
      case 'lock': return 'lock';
      case 'camera': return 'camera';
      case 'binary_sensor':
        if (deviceClass === 'motion' || deviceClass === 'occupancy' || deviceClass === 'presence') return 'motion';
        if (deviceClass === 'door' || deviceClass === 'garage_door' || deviceClass === 'opening') return 'door';
        if (deviceClass === 'window') return 'window';
        if (deviceClass === 'smoke' || deviceClass === 'gas' || deviceClass === 'safety') return 'bell';
        return 'dot';
      case 'sensor':
        if (deviceClass === 'temperature') return 'thermo';
        if (deviceClass === 'humidity') return 'drop';
        if (deviceClass === 'battery') return 'battery';
        if (deviceClass === 'power' || deviceClass === 'energy') return 'bolt';
        return 'gauge';
      case 'weather': return state === 'rainy' || state === 'pouring' ? 'rain' : (state === 'sunny' ? 'sun' : (state === 'clear-night' ? 'moon' : 'cloud'));
      case 'scene': return 'scene';
      case 'script': return 'script';
      case 'automation': return 'bolt';
      case 'alarm_control_panel': return 'shield';
      case 'person': case 'device_tracker': return 'person';
      case 'humidifier': return 'drop';
      case 'water_heater': return 'flame';
      case 'siren': return 'bell';
      default: return 'dot';
    }
  }

  var DRAW = {
    toggle: function (on, c) {
      return '<rect x="5" y="14" width="38" height="20" rx="10" fill="' + (on ? 'rgba(90,170,255,.28)' : 'rgba(255,255,255,.1)') + '" stroke="' + (on ? '#3b9bff' : c) + '" stroke-width="3"/>'
        + '<circle cx="' + (on ? 33 : 15) + '" cy="24" r="5.5" fill="' + (on ? '#2f9e4f' : c) + '"/>';
    },
    outlet: function (on, c) {
      var col = on ? '#3b9bff' : c;
      return '<rect x="9" y="9" width="30" height="30" rx="9" fill="' + (on ? 'rgba(90,170,255,.2)' : 'none') + '" stroke="' + col + '" stroke-width="3"/><path d="M18 20v4M30 20v4M19 30c2.5 2 7.5 2 10 0" stroke="' + col + '" stroke-width="3"/>';
    },
    light: function (on, c) {
      var col = on ? '#f5a30b' : c;
      return '<path d="M24 6a13 13 0 0 0-7.6 23.5c1.3 1 2 2.2 2 3.7V35h11.2v-1.8c0-1.5.7-2.7 2-3.7A13 13 0 0 0 24 6z" fill="' + (on ? 'rgba(245,163,11,.35)' : 'none') + '" stroke="' + col + '" stroke-width="3"/><path d="M19 40h10M21 44h6" stroke="' + col + '" stroke-width="3"/>';
    },
    lights: function (on, c) {                      // the Lights screen stands for a group, so it shows three bulbs
      var col = on ? '#f5a30b' : c, fill = on ? 'rgba(245,163,11,.35)' : 'none';
      var bulb = function (x, y) { return '<g transform="translate(' + x + ' ' + y + ') scale(.55)" stroke="' + col + '" stroke-width="5"><path d="M24 6a13 13 0 0 0-7.6 23.5c1.3 1 2 2.2 2 3.7V35h11.2v-1.8c0-1.5.7-2.7 2-3.7A13 13 0 0 0 24 6z" fill="' + fill + '"/><path d="M19 40h10M21 44h6"/></g>'; };
      return bulb(-5, 17) + bulb(26, 17) + bulb(10.5, 10);
    },
    tv: function (on, c) {
      var col = on ? '#2d8cf0' : c;
      return '<rect x="5" y="8" width="38" height="26" rx="4" fill="' + (on ? 'rgba(45,140,240,.18)' : 'none') + '" stroke="' + col + '" stroke-width="3"/><path d="M17 41h14M24 34v7" stroke="' + col + '" stroke-width="3"/>' + (on ? '<path d="M14 26V16M14 21h6M20 16l-6 5 6 5M27 16v10M27 21l7-5M27 21l7 5" stroke="' + col + '" stroke-width="2.6"/>' : '');
    },
    speaker: function (on, c) {
      var col = on ? '#8e5be8' : c;
      return '<rect x="12" y="5" width="24" height="38" rx="6" fill="' + (on ? 'rgba(142,91,232,.2)' : 'none') + '" stroke="' + col + '" stroke-width="3"/><circle cx="24" cy="28" r="7" stroke="' + col + '" stroke-width="3"/><circle cx="24" cy="14" r="1.6" fill="' + col + '"/>';
    },
    snow: function (on, c) {
      return '<rect x="5" y="5" width="38" height="38" rx="9" fill="' + (on ? 'rgba(80,220,255,.22)' : 'none') + '" stroke="' + (on ? '#22d3ee' : c) + '" stroke-width="3"/><path d="M24 12v24M13.6 18l20.8 12M13.6 30l20.8-12M20 14l4 3 4-3M20 34l4-3 4 3" stroke="' + (on ? '#22d3ee' : c) + '" stroke-width="2.6"/>';
    },
    flame: function (on, c) {
      var col = on ? '#f0731b' : c;
      return '<path d="M24 5c2.5 8 11 11 11 22a11 11 0 0 1-22 0c0-4.5 2-7 4.5-10 .5 4 2.5 6 4.5 6 0-6-1.5-11 2-18z" fill="' + (on ? 'rgba(240,115,27,.3)' : 'none') + '" stroke="' + col + '" stroke-width="3"/>';
    },
    thermo: function (on, c) {
      var col = on ? '#e0492f' : c;
      return '<path d="M28 28V10a4 4 0 0 0-8 0v18a8 8 0 1 0 8 0z" fill="' + (on ? 'rgba(224,73,47,.18)' : 'none') + '" stroke="' + col + '" stroke-width="3"/><path d="M24 17v16" stroke="' + col + '" stroke-width="3"/>';
    },
    blinds: function (on, c) {
      var col = on ? '#2fa35c' : c;
      return '<rect x="7" y="5" width="34" height="38" rx="3" stroke="' + col + '" stroke-width="3"/>' + [13, 20, 27, 34].map(function (y) { return '<path d="M12 ' + y + 'h24" stroke="' + col + '" stroke-width="3"/>'; }).join('');
    },
    garage: function (on, c) {
      var col = on ? '#2fa35c' : c;
      return '<path d="M5 42V18l19-11 19 11v24" stroke="' + col + '" stroke-width="3"/><path d="M12 42V25h24v17M12 31h24M12 37h24" stroke="' + col + '" stroke-width="2.6"/>';
    },
    fan: function (on, c) {
      var col = on ? '#14b8a6' : c;
      return '<circle cx="24" cy="24" r="3.2" fill="' + col + '"/><path d="M24 20.8C24 11 26.5 6 31 6s3.2 9.5-7 14.8zM27.2 24C37 24 42 26.5 42 31s-9.5 3.2-14.8-7zM24 27.2C24 37 21.5 42 17 42s-3.2-9.5 7-14.8zM20.8 24C11 24 6 21.5 6 17s9.5-3.2 14.8 7z" stroke="' + col + '" stroke-width="2.6" fill="' + (on ? 'rgba(20,184,166,.18)' : 'none') + '"/>';
    },
    vacuum: function (on, c) {
      var col = on ? '#2fa35c' : c;
      return '<circle cx="24" cy="24" r="18" fill="' + (on ? 'rgba(47,163,92,.15)' : 'none') + '" stroke="' + col + '" stroke-width="3"/><circle cx="24" cy="24" r="6.5" stroke="' + col + '" stroke-width="3"/><path d="M24 6v6" stroke="' + col + '" stroke-width="3"/>';
    },
    lock: function (on, c) {
      var col = on ? '#e0492f' : c;
      return '<rect x="9" y="21" width="30" height="21" rx="5" fill="' + (on ? 'rgba(224,73,47,.15)' : 'none') + '" stroke="' + col + '" stroke-width="3"/><path d="M15 21v-6a9 9 0 0 1 18 0v6M24 28v6" stroke="' + col + '" stroke-width="3"/>';
    },
    camera: function (on, c) {
      var col = on ? '#4f8cff' : c;
      return '<rect x="4" y="13" width="26" height="22" rx="5" stroke="' + col + '" stroke-width="3"/><path d="M30 21l14-7v20l-14-7z" stroke="' + col + '" stroke-width="3"/>';
    },
    motion: function (on, c) {
      var col = on ? '#e0492f' : c;
      return '<circle cx="24" cy="24" r="3.5" fill="' + col + '"/><path d="M14.5 14.5a13.4 13.4 0 0 0 0 19M33.5 14.5a13.4 13.4 0 0 1 0 19M8 8a22 22 0 0 0 0 32M40 8a22 22 0 0 1 0 32" stroke="' + col + '" stroke-width="3"/>';
    },
    door: function (on, c) {
      var col = on ? '#e0952f' : c;
      return '<rect x="12" y="5" width="24" height="38" rx="2" stroke="' + col + '" stroke-width="3"/><circle cx="30" cy="25" r="1.8" fill="' + col + '"/>';
    },
    window: function (on, c) {
      var col = on ? '#4f8cff' : c;
      return '<rect x="8" y="5" width="32" height="38" rx="2" stroke="' + col + '" stroke-width="3"/><path d="M24 5v38M8 24h32" stroke="' + col + '" stroke-width="3"/>';
    },
    bell: function (on, c) {
      var col = on ? '#e0492f' : c;
      return '<path d="M12 20a12 12 0 0 1 24 0c0 12 4 14 4 14H8s4-2 4-14zM20 40a4 4 0 0 0 8 0" stroke="' + col + '" stroke-width="3"/>';
    },
    drop: function (on, c) {
      var col = on ? '#2d8cf0' : c;
      return '<path d="M24 5s14 14 14 25a14 14 0 0 1-28 0C10 19 24 5 24 5z" fill="' + (on ? 'rgba(45,140,240,.2)' : 'none') + '" stroke="' + col + '" stroke-width="3"/>';
    },
    battery: function (on, c) {
      return '<rect x="5" y="14" width="34" height="20" rx="4" stroke="' + c + '" stroke-width="3"/><path d="M43 21v6M11 20v8M17 20v8M23 20v8" stroke="' + c + '" stroke-width="3"/>';
    },
    bolt: function (on, c) {
      var col = on ? '#f5a30b' : c;
      return '<path d="M27 4L9 28h13l-2 16 19-25H26z" fill="' + (on ? 'rgba(245,163,11,.3)' : 'none') + '" stroke="' + col + '" stroke-width="3"/>';
    },
    gauge: function (on, c) { return '<path d="M7 34a17 17 0 1 1 34 0M24 34l9-10" stroke="' + c + '" stroke-width="3"/>'; },
    sun: function (on, c) { var col = on ? '#f5a30b' : c; return '<circle cx="24" cy="24" r="8" stroke="' + col + '" stroke-width="3"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M10 38l4-4M34 14l4-4" stroke="' + col + '" stroke-width="3"/>'; },
    moon: function (on, c) { return '<path d="M40 29A16 16 0 0 1 19 8a16 16 0 1 0 21 21z" stroke="' + c + '" stroke-width="3"/>'; },
    cloud: function (on, c) { return '<path d="M14 36a9 9 0 0 1-1-18 12 12 0 0 1 23 3 8 8 0 0 1 0 15H14z" stroke="' + c + '" stroke-width="3"/>'; },
    rain: function (on, c) { return '<path d="M14 30a9 9 0 0 1-1-17 12 12 0 0 1 23 3 8 8 0 0 1 0 14H14zM17 36l-2 6M25 36l-2 6M33 36l-2 6" stroke="' + c + '" stroke-width="3"/>'; },
    scene: function (on, c) { return '<path d="M24 5a19 19 0 1 0 0 38c3 0 4-2 3-4-1.2-2.4.4-5 3-5h5a8 8 0 0 0 8-8C43 14 34.5 5 24 5z" stroke="' + c + '" stroke-width="3"/><circle cx="15" cy="23" r="2" fill="' + c + '"/><circle cx="20" cy="15" r="2" fill="' + c + '"/><circle cx="29" cy="15" r="2" fill="' + c + '"/>'; },
    script: function (on, c) { return '<path d="M15 6h17l8 8v28H15zM21 22h13M21 29h13" stroke="' + c + '" stroke-width="3"/>'; },
    shield: function (on, c) { var col = on ? '#e0492f' : c; return '<path d="M24 5l17 6v13c0 10-7 16-17 19-10-3-17-9-17-19V11z" stroke="' + col + '" stroke-width="3"/>'; },
    person: function (on, c) { return '<circle cx="24" cy="16" r="8" stroke="' + c + '" stroke-width="3"/><path d="M8 42a16 16 0 0 1 32 0" stroke="' + c + '" stroke-width="3"/>'; },
    dot: function (on, c) { return '<circle cx="24" cy="24" r="14" stroke="' + c + '" stroke-width="3"/><circle cx="24" cy="24" r="4" fill="' + c + '"/>'; },
  };
  // the two that move
  var LOOPS = { fan: 1, vacuum: 1 };

  /** Coloured icon markup for a tile. on = the tile is white. */
  function deviceSvg(item, state, on, size, attrs) {
    var dc = (attrs && attrs.device_class) || item.deviceClass;
    var k = item.id === 'gadget.lights' ? 'lights' : kind(item.domain, dc, state, attrs);
    var col = on ? 'rgba(0,0,0,.72)' : OFF;
    var body = (DRAW[k] || DRAW.dot)(on, col);
    return sv(size || 48, body, 'k-' + k);
  }

  var api = { kind: kind, deviceSvg: deviceSvg, KINDS: Object.keys(DRAW), LOOPS: LOOPS };
  if (isNode) module.exports = api;
  else { g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.icons = api; }
})(typeof globalThis !== 'undefined' ? globalThis : window);
