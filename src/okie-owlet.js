/* okie-owlet: the Owlet camera's split live-view + glass info panel, used by the
 * Cameras app (okie-cameras.js) when the selected camera matches
 * settings.cameras.owlet.entity.
 *
 * The panel has several swipeable pages, dots like okie-weather.js's city pager:
 *   - Comfort: this camera's own room temperature + humidity sensors (real data)
 *   - Morning report, Sleep trends, Health patterns, Sleep positions: Owlet's sock
 *     reports these, styled after Owlet's own app, but with no sock paired yet
 *     these pages show demo data clearly marked "Demo - add a Dream Sock" so
 *     nothing here is mistaken for a real reading.
 * The live view gets a small top-right temp/humidity badge (same idea as Owlet's
 * own live view overlay, redrawn in Okie's icon set) and, like every other
 * camera's live view, a bottom-right full-screen button (okie-cameras.js).
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // ---------------------------------------------------------- pure part (unit-tested) ----
  /** Every entity of an Owlet Dream Sock (idomp/owlet: "<room>_owlet_sock_..."): folded into ONE item, so the search,
   *  the Sensors screen, the rooms and the favorites picker show the sock once instead of thirty sensors. */
  var OWN = /^(sensor|binary_sensor)\.[a-z0-9_]*owlet_sock/;
  function owns(id) { return OWN.test(id); }
  /** The collection with the sock's entities folded into { id: 'gadget.owlet', domain: 'gadget', deviceClass: 'owlet' }. */
  function fold(items, states, areas) {
    var mem = Object.keys(states || {}).filter(owns); if (!mem.length) return items;
    var areaId = null;
    items.forEach(function (i) { if (!areaId && owns(i.id) && /_heart_rate$/.test(i.id) && i.areaId) areaId = i.areaId; });
    items.forEach(function (i) { if (!areaId && owns(i.id) && i.areaId) areaId = i.areaId; });
    return items.filter(function (i) { return !owns(i.id); }).concat([{ id: 'gadget.owlet', domain: 'gadget', deviceClass: 'owlet', name: 'Owlet Sock', areaId: areaId, area: areaId && areas && areas[areaId] ? areas[areaId].name : null, labels: [], state: '', unit: null, icon: null, category: null }]);
  }
  /** The base station's light, as Owlet's app shows it: red = heart rate / oxygen out of range (a red alarm), yellow =
   *  look at the sock (disconnected, low battery, base lost power, discomfort, no fresh readings), blue = charging,
   *  green = worn and reading, idle = on the base station but not worn, off = base station off / not reachable.
   *  stateOf(id) -> the state string or undefined; p = the sock prefix ('bedroom_owlet_sock').
   *  Returns { level, why } - why is the alert's key ('low_oxygen' ...) or ''. */
  var RED = ['low_oxygen', 'high_oxygen', 'low_heart_rate', 'high_heart_rate'];
  var YELLOW = ['sock_disconnected', 'low_battery', 'lost_power', 'discomfort'];
  function sockStatus(stateOf, p) {
    var b = function (k) { return stateOf('binary_sensor.' + p + '_' + k); }, on = function (k) { return b(k) === 'on'; };
    var hr = stateOf('sensor.' + p + '_heart_rate'), base = b('base_station_on');
    var dead = function (s) { return s === undefined || s === 'unavailable' || s === 'unknown'; };
    if (dead(hr) && dead(base)) return { level: 'off', why: 'offline' };
    for (var i = 0; i < RED.length; i++) if (on(RED[i] + '_alert')) return { level: 'red', why: RED[i] };
    if (on('preview_high_priority_alarm') || on('preview_drm_priority_alarm')) return { level: 'red', why: 'alarm' };
    for (var j = 0; j < YELLOW.length; j++) if (on(YELLOW[j] + '_alert')) return { level: 'yellow', why: YELLOW[j] };
    if (on('preview_medium_priority_alarm')) return { level: 'yellow', why: 'check' };
    if (on('charging')) return { level: 'blue', why: 'charging' };
    if (base === 'off') return { level: 'off', why: 'base_off' };
    if (on('sock_off') || dead(hr)) return { level: 'idle', why: 'not_worn' };
    if (on('data_stale')) return { level: 'yellow', why: 'stale' };
    return { level: 'green', why: '' };
  }
  var pure = { owns: owns, fold: fold, sockStatus: sockStatus };
  if (isNode) { module.exports = pure; return; }
  if (typeof document === 'undefined') return;

  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;

  core.registerStrings('en', {
    'owl.comfort': 'Comfort Temp', 'owl.humidity': 'Humidity', 'owl.warmer': 'Warmer', 'owl.cooler': 'Cooler',
    'owl.morning': 'Morning Report', 'owl.restful': 'Restful', 'owl.total_sleep': 'Total Night Sleep',
    'owl.trends': 'Weekly Sleep Trends', 'owl.longest': 'Longest Stretch', 'owl.wakings': 'Wakings',
    'owl.health': 'Health Patterns', 'owl.oxygen': 'Oxygen', 'owl.pulse': 'Pulse Rate', 'owl.today_avg': 'Today\'s avg',
    'owl.positions': 'Sleep Positions', 'owl.back': 'Back', 'owl.tummy': 'Tummy', 'owl.side': 'Side',
    'owl.demo': 'Demo - add a Dream Sock for real readings',
    'owl.recording': 'Recording', 'owl.now': 'Right now', 'owl.sleep_state': 'Sleep state', 'owl.battery': 'Sock battery', 'owl.skin_temp': 'Skin temperature',
    'owl.sleep_awake': 'Awake', 'owl.sleep_asleep': 'Asleep', 'owl.sleep_deep': 'Deep sleep', 'owl.sleep_light': 'Light sleep',
    'owl.demo_history': 'Demo - not enough sleep history yet', 'owl.demo_unsupported': 'Demo - this sock does not report sleep position',
    'owl.sock_title': 'Owlet Sock', 'owl.sock_idle': 'Idle - not worn',
    'owl.sock_conn': 'Sock Connected', 'owl.realtime': 'Real-time vitals', 'owl.signal': 'Signal', 'owl.movement': 'Movement', 'owl.mv_on': 'Moving', 'owl.mv_still': 'Still', 'owl.sensor_off': 'Sensor off', 'owl.session': 'Session', 'owl.stage': 'Sleep Stage',
    'owl.score': 'Sleep Score', 'owl.score_about': 'About the Sleep Score', 'owl.sc_exc': 'Excellent', 'owl.sc_good': 'Good', 'owl.sc_fair': 'Fair', 'owl.sc_poor': 'Restless', 'owl.vs_last': '{d} vs. last night', 'owl.first_night': 'First night recorded',
    'owl.score_info': 'Worked out by Okie from the sock\'s own readings: time asleep against the {g} h goal (50), deep sleep share (25), few wakings (15) and oxygen (10). It is not an Owlet or medical score.',
    'owl.total_since': 'Total Sleep · Since {t}', 'owl.stages': 'Sleep Stages', 'owl.cycles': 'Sleep Cycles', 'owl.wakes': 'Wakings', 'owl.timeline': 'Cycle Timeline', 'owl.night_vitals': 'Night Vitals', 'owl.hr_steady': 'Steady heart', 'owl.o2_avg': 'Oxygen avg', 'owl.restless': 'Restlessness', 'owl.off': 'Off', 'owl.insights': 'Sleep Insights',
    'owl.ins_deep': 'Plenty of deep sleep last night.', 'owl.ins_wakes': 'A few more wakings than usual last night.', 'owl.ins_goal': 'Close to the sleep goal last night.', 'owl.ins_ok': 'A calm night so far.',
    'owl.history': 'History', 'owl.h_day': 'Day', 'owl.h_week': 'Week', 'owl.h_month': 'Month', 'owl.pick_date': 'Pick a date', 'owl.earlier': 'Earlier', 'owl.later': 'Later', 'owl.avg': 'Avg.', 'owl.min_max': 'Min {a}{u} · Max {b}{u}', 'owl.no_read': 'No readings',
    'owl.sleep_davg': 'Sleep · per day', 'owl.vs_yday': 'vs yesterday', 'owl.vs_prev_w': 'vs week before', 'owl.vs_prev_m': 'vs month before', 'owl.vs_7d': 'vs 7d avg', 'owl.weekly': 'Weekly Trends', 'owl.avg_hr': 'Avg. Heart Rate', 'owl.avg_o2': 'Avg. Oxygen', 'owl.compare': 'Comparison',
    'owl.baby_mode': 'Baby monitor mode', 'owl.baby_missing': 'The wall tablet\'s Baby monitor switch is not in Home Assistant yet', 'owl.baby_fail': 'The wall tablet did not answer',
    'owl.lp_lullaby': 'Lullaby {n}', 'owl.lp_soothing': 'Soothing sound {n}', 'owl.lp_endless': 'Plays on and on', 'owl.lp_stopped': 'Stopped', 'owl.lp_rename': 'Rename the sounds', 'owl.lp_title': 'Lullabies', 'owl.lp_owlet': 'Owlet sounds', 'owl.lp_mine': 'My songs', 'owl.lp_add': 'Add a song', 'owl.lp_loop': 'Loop', 'owl.lp_stop': 'Stop', 'owl.lp_volume': 'Camera speaker volume', 'owl.lp_camera': 'Camera', 'owl.lp_sound': 'Sound {n}', 'owl.lp_none': 'No songs yet. Add one from your phone.', 'owl.lp_none_cam': 'The camera did not list its sounds yet.', 'owl.lp_setup': 'The nursery speaker commands are not in Home Assistant yet.', 'owl.lp_fail': 'The camera speaker did not answer', 'owl.lp_uploading': 'Adding the song…', 'owl.lp_added': 'Song added to Owlet Sounds', 'owl.lp_big': 'That file is too big (20 MB at most)', 'owl.lp_type': 'Pick a sound file (mp3, m4a, wav)', 'owl.talking': 'Talking… let go to send', 'owl.talk_sending': 'Sending to the room…', 'owl.talk_sent': 'Played in the room', 'owl.talk_fail': 'Your voice could not be sent', 'owl.talk_short': 'Hold the mic while you talk', 'owl.talk_blocked': 'Allow the microphone to talk to the room', 'owl.talk_nomic': 'This device cannot record here',
    'owl.cam_live': 'Live', 'owl.cam_mic': 'Hold to talk', 'owl.cam_clips': 'Clips', 'owl.cam_fit': 'Fit or fill', 'owl.cam_snap': 'Snapshot', 'owl.cam_rec': 'Record a clip', 'owl.cam_sock': 'Sock', 'owl.cam_online': 'Online', 'owl.cam_offline': 'Offline', 'owl.cam_sleeping': 'Sleeping', 'owl.cam_mic_off': 'Talk-back is switched off on the Owlet bridge for now', 'owl.cam_snap_saved': 'Snapshot saved to Owlet Clips', 'owl.cam_snap_fail': 'The snapshot could not be saved',
    'owl.sock_of': '{n}’s Sock', 'owl.battery_t': 'Battery', 'owl.batt_left': 'About {h} h left', 'owl.monitoring': 'Monitoring', 'owl.monitoring_sub': 'What the card watches', 'owl.sleep_track': 'Sleep Tracking',
    'owl.alerts': 'Alerts', 'owl.alerts_sub': 'Get notified when something needs attention', 'owl.al_lowHr': 'Low Heart Rate', 'owl.al_highHr': 'High Heart Rate', 'owl.al_lowO2': 'Low Oxygen', 'owl.al_sockOff': 'Sock Off',
    'owl.al_low_hr_n': 'Heart rate low: {v} bpm', 'owl.al_high_hr_n': 'Heart rate high: {v} bpm', 'owl.al_low_o2_n': 'Oxygen low: {v}%', 'owl.al_awake_n': 'Woke up', 'owl.al_sock_off_n': 'The sock is off',
    'owl.sleep_prefs': 'Sleep Preferences', 'owl.sleep_prefs_sub': 'Customize sleep tracking', 'owl.schedule': 'Sleep Schedule', 'owl.sleep_goal': 'Sleep Goal', 'owl.bedtime': 'Bedtime', 'owl.wake_time': 'Wake-up', 'owl.save': 'Save',
    'owl.profile': 'Profile', 'owl.profile_sub': 'Baby information', 'owl.add_name': 'Add a name', 'owl.add_birth': 'Add birth date', 'owl.name': 'Name', 'owl.birth': 'Birth date', 'owl.photo_add': 'Add photo', 'owl.photo_change': 'Change photo', 'owl.photo_remove': 'Remove', 'owl.uploading': 'Uploading…',
    'owl.devices': 'Connected Devices', 'owl.devices_sub': 'Linked to this baby', 'owl.cam': 'Owlet Cam', 'owl.not_conn': 'Not connected', 'owl.not_set': 'Not set up',
    'owl.dash_title': 'Health Dashboard', 'owl.live_mon': 'Live Monitoring', 'owl.hr': 'Heart Rate', 'owl.o2_long': 'Oxygen (SpO₂)', 'owl.sleep': 'Sleep', 'owl.since': 'Since {t}', 'owl.no_sleep': 'No sleep recorded yet',
    'owl.st_deep': 'Deep', 'owl.st_light': 'Light', 'owl.st_awake': 'Awake', 'owl.activity': 'Activity', 'owl.active_time': 'Active Time', 'owl.min': 'min', 'owl.move_off': 'Movement sensor is off in Home Assistant', 'owl.progress': 'Daily Progress', 'owl.vitals_mon': 'Vitals Monitored',
    'owl.age_d': '{n} days', 'owl.age_w': '{n} weeks', 'owl.age_m': '{n} months', 'owl.age_y': '{n} years',
    'owl.baby_monitor': 'Baby Monitor', 'owl.live': 'Live', 'owl.live_readings': 'Live Readings', 'owl.connected': 'Connected',
    'owl.more_settings': 'More settings', 'owl.smart_sock': 'Owlet Smart Sock', 'owl.pin': 'Add to favorites',
    'owl.st_low_oxygen': 'Low oxygen', 'owl.st_high_oxygen': 'High oxygen', 'owl.st_low_heart_rate': 'Low heart rate', 'owl.st_high_heart_rate': 'High heart rate', 'owl.st_alarm': 'Alarm',
    'owl.st_sock_disconnected': 'Sock disconnected', 'owl.st_low_battery': 'Low battery', 'owl.st_lost_power': 'Base lost power', 'owl.st_discomfort': 'Discomfort', 'owl.st_check': 'Check the sock', 'owl.st_stale': 'No fresh readings',
    'owl.st_charging': 'On the base', 'owl.st_base_off': 'Base station off', 'owl.st_offline': 'Not reachable', 'owl.st_not_worn': 'Not worn',
    'owl.tag_alert': 'Alert', 'owl.tag_check': 'Check', 'owl.tag_charging': 'Charging', 'owl.tag_idle': 'Idle', 'owl.tag_off': 'Off',
  });
  core.registerStrings('de', {
    'owl.comfort': 'Komforttemperatur', 'owl.humidity': 'Luftfeuchtigkeit', 'owl.warmer': 'Wärmer', 'owl.cooler': 'Kühler',
    'owl.morning': 'Morgenbericht', 'owl.restful': 'Erholsam', 'owl.total_sleep': 'Schlaf insgesamt',
    'owl.trends': 'Wöchentlicher Schlaftrend', 'owl.longest': 'Längste Phase', 'owl.wakings': 'Aufwachen',
    'owl.health': 'Gesundheitswerte', 'owl.oxygen': 'Sauerstoff', 'owl.pulse': 'Puls', 'owl.today_avg': 'Heute Ø',
    'owl.positions': 'Schlafpositionen', 'owl.back': 'Rücken', 'owl.tummy': 'Bauch', 'owl.side': 'Seite',
    'owl.demo': 'Demo – für echte Werte einen Dream Sock hinzufügen',
    'owl.recording': 'Aufnahme', 'owl.now': 'Gerade jetzt', 'owl.sleep_state': 'Schlafzustand', 'owl.battery': 'Sock-Akku', 'owl.skin_temp': 'Hauttemperatur',
    'owl.sleep_awake': 'Wach', 'owl.sleep_asleep': 'Schläft', 'owl.sleep_deep': 'Tiefschlaf', 'owl.sleep_light': 'Leichter Schlaf',
    'owl.demo_history': 'Demo – noch nicht genug Schlafverlauf', 'owl.demo_unsupported': 'Demo – dieser Sock meldet keine Schlafposition',
    'owl.sock_title': 'Owlet Sock', 'owl.sock_idle': 'Ruht – wird nicht getragen',
    'owl.sock_conn': 'Socken verbunden', 'owl.realtime': 'Vitalwerte in Echtzeit', 'owl.signal': 'Signal', 'owl.movement': 'Bewegung', 'owl.mv_on': 'Bewegt sich', 'owl.mv_still': 'Ruhig', 'owl.sensor_off': 'Sensor aus', 'owl.session': 'Sitzung', 'owl.stage': 'Schlafphase',
    'owl.score': 'Schlafwert', 'owl.score_about': 'Über den Schlafwert', 'owl.sc_exc': 'Ausgezeichnet', 'owl.sc_good': 'Gut', 'owl.sc_fair': 'Mittel', 'owl.sc_poor': 'Unruhig', 'owl.vs_last': '{d} ggü. letzter Nacht', 'owl.first_night': 'Erste aufgezeichnete Nacht',
    'owl.score_info': 'Von Okie aus den Werten des Socks berechnet: Schlafdauer gegenüber dem Ziel von {g} h (50), Tiefschlafanteil (25), wenig Aufwachen (15) und Sauerstoff (10). Kein Owlet- oder medizinischer Wert.',
    'owl.total_since': 'Schlaf insgesamt · Seit {t}', 'owl.stages': 'Schlafphasen', 'owl.cycles': 'Schlafzyklen', 'owl.wakes': 'Aufwachen', 'owl.timeline': 'Zyklusverlauf', 'owl.night_vitals': 'Nachtwerte', 'owl.hr_steady': 'Ruhiges Herz', 'owl.o2_avg': 'Sauerstoff Ø', 'owl.restless': 'Unruhe', 'owl.off': 'Aus', 'owl.insights': 'Schlaf-Einblicke',
    'owl.ins_deep': 'Viel Tiefschlaf letzte Nacht.', 'owl.ins_wakes': 'Letzte Nacht etwas öfter aufgewacht.', 'owl.ins_goal': 'Letzte Nacht nah am Schlafziel.', 'owl.ins_ok': 'Bisher eine ruhige Nacht.',
    'owl.history': 'Verlauf', 'owl.h_day': 'Tag', 'owl.h_week': 'Woche', 'owl.h_month': 'Monat', 'owl.pick_date': 'Datum wählen', 'owl.earlier': 'Früher', 'owl.later': 'Später', 'owl.avg': 'Ø', 'owl.min_max': 'Min. {a}{u} · Max. {b}{u}', 'owl.no_read': 'Keine Werte',
    'owl.sleep_davg': 'Schlaf · pro Tag', 'owl.vs_yday': 'ggü. gestern', 'owl.vs_prev_w': 'ggü. Vorwoche', 'owl.vs_prev_m': 'ggü. Vormonat', 'owl.vs_7d': 'ggü. 7-Tage-Ø', 'owl.weekly': 'Wochentrend', 'owl.avg_hr': 'Ø Herzfrequenz', 'owl.avg_o2': 'Ø Sauerstoff', 'owl.compare': 'Vergleich',
    'owl.baby_mode': 'Babyfon-Modus', 'owl.baby_missing': 'Der Babyfon-Schalter des Wand-Tablets fehlt noch in Home Assistant', 'owl.baby_fail': 'Das Wand-Tablet hat nicht geantwortet',
    'owl.lp_lullaby': 'Schlaflied {n}', 'owl.lp_soothing': 'Beruhigender Klang {n}', 'owl.lp_endless': 'Läuft durchgehend', 'owl.lp_stopped': 'Gestoppt', 'owl.lp_rename': 'Klänge umbenennen', 'owl.lp_title': 'Schlaflieder', 'owl.lp_owlet': 'Owlet-Klänge', 'owl.lp_mine': 'Meine Lieder', 'owl.lp_add': 'Lied hinzufügen', 'owl.lp_loop': 'Wiederholen', 'owl.lp_stop': 'Stopp', 'owl.lp_volume': 'Lautstärke des Kameralautsprechers', 'owl.lp_camera': 'Kamera', 'owl.lp_sound': 'Klang {n}', 'owl.lp_none': 'Noch keine Lieder. Füge eines vom Telefon hinzu.', 'owl.lp_none_cam': 'Die Kamera hat ihre Klänge noch nicht gemeldet.', 'owl.lp_setup': 'Die Lautsprecher-Befehle fehlen noch in Home Assistant.', 'owl.lp_fail': 'Der Kameralautsprecher hat nicht geantwortet', 'owl.lp_uploading': 'Lied wird hinzugefügt…', 'owl.lp_added': 'Lied in Owlet Sounds gespeichert', 'owl.lp_big': 'Die Datei ist zu groß (höchstens 20 MB)', 'owl.lp_type': 'Wähle eine Audiodatei (mp3, m4a, wav)', 'owl.talking': 'Sprich… loslassen zum Senden', 'owl.talk_sending': 'Wird ins Zimmer gesendet…', 'owl.talk_sent': 'Im Zimmer abgespielt', 'owl.talk_fail': 'Deine Stimme konnte nicht gesendet werden', 'owl.talk_short': 'Halte das Mikrofon beim Sprechen gedrückt', 'owl.talk_blocked': 'Erlaube das Mikrofon, um ins Zimmer zu sprechen', 'owl.talk_nomic': 'Dieses Gerät kann hier nicht aufnehmen',
    'owl.cam_live': 'Live', 'owl.cam_mic': 'Gedrückt halten zum Sprechen', 'owl.cam_clips': 'Clips', 'owl.cam_fit': 'Einpassen oder füllen', 'owl.cam_snap': 'Foto', 'owl.cam_rec': 'Clip aufnehmen', 'owl.cam_sock': 'Socke', 'owl.cam_online': 'Online', 'owl.cam_offline': 'Offline', 'owl.cam_sleeping': 'Schläft', 'owl.cam_mic_off': 'Sprechen ist auf der Owlet-Bridge noch ausgeschaltet', 'owl.cam_snap_saved': 'Foto in Owlet Clips gespeichert', 'owl.cam_snap_fail': 'Das Foto konnte nicht gespeichert werden',
    'owl.sock_of': 'Socke von {n}', 'owl.battery_t': 'Akku', 'owl.batt_left': 'Noch etwa {h} h', 'owl.monitoring': 'Überwachung', 'owl.monitoring_sub': 'Was die Karte beobachtet', 'owl.sleep_track': 'Schlaferfassung',
    'owl.alerts': 'Meldungen', 'owl.alerts_sub': 'Hinweise in der Karte, wenn etwas Aufmerksamkeit braucht', 'owl.al_lowHr': 'Niedriger Puls', 'owl.al_highHr': 'Hoher Puls', 'owl.al_lowO2': 'Wenig Sauerstoff', 'owl.al_sockOff': 'Socke ab',
    'owl.al_low_hr_n': 'Puls niedrig: {v} bpm', 'owl.al_high_hr_n': 'Puls hoch: {v} bpm', 'owl.al_low_o2_n': 'Sauerstoff niedrig: {v} %', 'owl.al_awake_n': 'Aufgewacht', 'owl.al_sock_off_n': 'Die Socke ist ab',
    'owl.sleep_prefs': 'Schlaf-Einstellungen', 'owl.sleep_prefs_sub': 'Schlaferfassung anpassen', 'owl.schedule': 'Schlafzeiten', 'owl.sleep_goal': 'Schlafziel', 'owl.bedtime': 'Schlafenszeit', 'owl.wake_time': 'Aufwachen', 'owl.save': 'Sichern',
    'owl.profile': 'Profil', 'owl.profile_sub': 'Angaben zum Baby', 'owl.add_name': 'Namen hinzufügen', 'owl.add_birth': 'Geburtsdatum hinzufügen', 'owl.name': 'Name', 'owl.birth': 'Geburtsdatum', 'owl.photo_add': 'Foto hinzufügen', 'owl.photo_change': 'Foto ändern', 'owl.photo_remove': 'Entfernen', 'owl.uploading': 'Wird hochgeladen…',
    'owl.devices': 'Verbundene Geräte', 'owl.devices_sub': 'Mit diesem Baby verknüpft', 'owl.cam': 'Owlet Cam', 'owl.not_conn': 'Nicht verbunden', 'owl.not_set': 'Nicht eingerichtet',
    'owl.dash_title': 'Gesundheit', 'owl.live_mon': 'Live-Überwachung', 'owl.hr': 'Herzfrequenz', 'owl.o2_long': 'Sauerstoff (SpO₂)', 'owl.sleep': 'Schlaf', 'owl.since': 'Seit {t}', 'owl.no_sleep': 'Noch kein Schlaf aufgezeichnet',
    'owl.st_deep': 'Tief', 'owl.st_light': 'Leicht', 'owl.st_awake': 'Wach', 'owl.activity': 'Aktivität', 'owl.active_time': 'Aktive Zeit', 'owl.min': 'Min.', 'owl.move_off': 'Bewegungssensor in Home Assistant aus', 'owl.progress': 'Tagesfortschritt', 'owl.vitals_mon': 'Vitalwerte überwacht',
    'owl.age_d': '{n} Tage', 'owl.age_w': '{n} Wochen', 'owl.age_m': '{n} Monate', 'owl.age_y': '{n} Jahre',
    'owl.baby_monitor': 'Babyphone', 'owl.live': 'Live', 'owl.live_readings': 'Live-Werte', 'owl.connected': 'Verbunden',
    'owl.more_settings': 'Weitere Einstellungen', 'owl.smart_sock': 'Owlet Smart Sock', 'owl.pin': 'Zu Favoriten',
    'owl.st_low_oxygen': 'Wenig Sauerstoff', 'owl.st_high_oxygen': 'Hoher Sauerstoff', 'owl.st_low_heart_rate': 'Niedriger Puls', 'owl.st_high_heart_rate': 'Hoher Puls', 'owl.st_alarm': 'Alarm',
    'owl.st_sock_disconnected': 'Sock getrennt', 'owl.st_low_battery': 'Akku schwach', 'owl.st_lost_power': 'Basis ohne Strom', 'owl.st_discomfort': 'Unwohlsein', 'owl.st_check': 'Sock prüfen', 'owl.st_stale': 'Keine neuen Werte',
    'owl.st_charging': 'Auf der Basis', 'owl.st_base_off': 'Basis aus', 'owl.st_offline': 'Nicht erreichbar', 'owl.st_not_worn': 'Nicht angelegt',
    'owl.tag_alert': 'Alarm', 'owl.tag_check': 'Prüfen', 'owl.tag_charging': 'Lädt', 'owl.tag_idle': 'Ruht', 'owl.tag_off': 'Aus',
  });

  function T(ctx) { return function (k, v) { return core.t(k, ctx.lang(), v); }; }

  /** settings.cameras.owlet = { entity, tempEntity, humidityEntity, sockPrefix }; the room sensors fall back to this
   *  camera's own temperature/humidity sensors (same "name starts with the camera's key" match okie-cameras.js uses
   *  for alerts). The Dream Sock is a SEPARATE device (idomp/owlet's own integration, its own entity prefix, nothing
   *  to do with the camera's key) - sockPrefix auto-detects by finding any "*owlet*sock*heart_rate" sensor and using
   *  everything before "_heart_rate" as the prefix, so every other sock entity id is just prefix + suffix. */
  /** autoSockPrefix(ctx): finds any "*owlet*sock*_heart_rate" sensor and returns everything before "_heart_rate" -
   *  shared by configFor() (the camera's panel) and sockOnlyConfig() (the standalone Sock card, no camera needed). */
  function autoSockPrefix(ctx) {
    var hs = ctx.hass(); if (!hs) return '';
    var hit = Object.keys(hs.states).filter(function (id) {
      return id.indexOf('sensor.') === 0 && /owlet/i.test(id) && /sock/i.test(id) && /_heart_rate$/.test(id);
    }).sort()[0];
    return hit ? hit.replace(/^sensor\./, '').replace(/_heart_rate$/, '') : '';
  }

  function configFor(ctx, cameraId) {
    var cc = (ctx.settings.get().cameras || {}).owlet;
    if (!cc || !cc.entity || cc.entity !== cameraId) return null;
    var cams = g.OkieMotor.cameras, key = cams ? cams.cameraKey(cameraId) : '';
    function auto(deviceClass) {
      var hs = ctx.hass(); if (!hs || !key) return '';
      var hit = Object.keys(hs.states).filter(function (id) {
        if (id.indexOf('sensor.') !== 0) return false;
        var obj = id.slice(7), st = hs.states[id];
        return (obj === key || obj.indexOf(key + '_') === 0) && st.attributes && st.attributes.device_class === deviceClass;
      }).sort()[0];
      return hit || '';
    }
    return {
      entity: cc.entity, tempEntity: cc.tempEntity || auto('temperature'), humidityEntity: cc.humidityEntity || auto('humidity'), recordingEntity: cc.recordingEntity || '',
      sockPrefix: cc.sockPrefix || autoSockPrefix(ctx),
    };
  }

  /** sockOnlyConfig(ctx) -> a cfg usable by panel()/sockIds() without any camera involved, for the standalone
   *  Sock card: reuses the configured camera's cfg when one exists (so its Comfort tab still has room sensors),
   *  otherwise a sock-only cfg (Comfort tab then just shows "--", the same honest fallback it always has).
   *  Returns null when no Dream Sock can be found at all - the card doesn't show up until one exists. */
  function sockOnlyConfig(ctx) {
    var cc = (ctx.settings.get().cameras || {}).owlet;
    if (cc && cc.entity) { var cfg = configFor(ctx, cc.entity); if (cfg && cfg.sockPrefix) return cfg; }
    var prefix = autoSockPrefix(ctx);
    return prefix ? { entity: '', tempEntity: '', humidityEntity: '', recordingEntity: '', sockPrefix: prefix } : null;
  }

  /** sockIds(cfg) -> { heartRate, o2, o2Avg, skinTemp, batteryPct, sleepState, lastReading, awake, charging, sockOff, dataStale } | null
   *  every real Dream Sock entity id, built from cfg.sockPrefix (idomp/owlet's own naming) - null when there is no sock paired. */
  function sockIds(cfg) {
    if (!cfg || !cfg.sockPrefix) return null;
    var p = cfg.sockPrefix;
    return {
      heartRate: 'sensor.' + p + '_heart_rate', o2: 'sensor.' + p + '_o2_saturation', o2Avg: 'sensor.' + p + '_o2_saturation_10_minute_average',
      skinTemp: 'sensor.' + p + '_skin_temperature', batteryPct: 'sensor.' + p + '_battery_percentage', sleepState: 'sensor.' + p + '_sleep_state',
      lastReading: 'sensor.' + p + '_last_reading', awake: 'binary_sensor.' + p + '_awake', charging: 'binary_sensor.' + p + '_charging',
      sockOff: 'binary_sensor.' + p + '_sock_off', signal: 'sensor.' + p + '_signal_strength', dataStale: 'binary_sensor.' + p + '_data_stale',
    };
  }
  /** Put the Motor's one battery (UI.battery: cell + % + green bolt while on the base) into el. */
  function battInto(el, ctx, ids, t) {
    var bv = ids ? num(ctx, ids.batteryPct) : null, c = ids && ctx.state(ids.charging);
    el.textContent = ''; el.appendChild(UI.battery(bv, !!(c && c.state === 'on'), t('owl.tag_charging')));
  }
  /** Is the sock actually being worn and reporting right now (not off, not stale)? */
  function sockLive(ctx, ids) {
    if (!ids) return false;
    var off = ctx.state(ids.sockOff), stale = ctx.state(ids.dataStale);
    return !(off && off.state === 'on') && !(stale && stale.state === 'on');
  }

  function num(ctx, id) { var st = id && ctx.state(id); var n = st ? parseFloat(st.state) : NaN; return isFinite(n) ? n : null; }
  function unitOf(ctx, id) { var st = id && ctx.state(id); return (st && st.attributes && st.attributes.unit_of_measurement) || ''; }

  // ---- demo data (deterministic by day-of-week, clearly not live readings) ----
  var DEMO = {
    stretch: [6.5, 8, 7, 11, 5.5, 9, 8.5],         // hours, "longest stretch" per weekday
    wakings: [3, 2, 3, 2, 4, 2, 1],
    oxygen: [97, 98, 96, 98, 97, 99, 98],          // %
    pulse: 128,                                    // bpm, today's avg
    positions: { back: 6.2, tummy: 0.4, side: 2.1 },// hours
    restful: 0.82, totalSleepMin: 7 * 60 + 26,
  };
  function weekdayLabels(lang) {
    var base = new Date(); base.setDate(base.getDate() - base.getDay());
    var out = []; for (var i = 0; i < 7; i++) { var d = new Date(base); d.setDate(base.getDate() + i); out.push(d.toLocaleDateString(lang, { weekday: 'narrow' })); }
    return out;
  }
  function fmtHm(min) { return Math.floor(min / 60) + 'h ' + (min % 60) + 'm'; }

  // ---- small chart builders (plain divs, no canvas: easy to theme, cheap to redraw) ----
  function barChart(values, max, labels, unitFn) {
    var wrap = h('div.ow-bars');
    values.forEach(function (v, i) {
      var pct = Math.max(4, Math.round((v / max) * 100));
      wrap.appendChild(h('div.ow-bar-col', null,
        h('div.ow-bar-track', null, h('div.ow-bar-fill', { style: { height: pct + '%' } })),
        h('div.ow-bar-v', null, unitFn ? unitFn(v) : String(v)),
        h('div.ow-bar-l', null, labels[i])));
    });
    return wrap;
  }
  function dotRow(values, max, labels) {
    var wrap = h('div.ow-dots-row');
    values.forEach(function (v, i) {
      var pct = Math.max(6, Math.round((v / max) * 100));
      wrap.appendChild(h('div.ow-dot-col', null, h('div.ow-dot-track', null, h('div.ow-dot', { style: { bottom: pct + '%' } })), h('div.ow-bar-l', null, labels[i])));
    });
    return wrap;
  }
  function ring(pct, label, sub) {
    var deg = Math.round(360 * Math.max(0, Math.min(1, pct)));
    return h('div.ow-ring', { style: { '--ow-ring-deg': deg + 'deg' } },
      h('div.ow-ring-face', null, h('span', { html: UI.icon('moon', 26) }), h('b', null, label), sub ? h('em', null, sub) : null));
  }

  /** The Comfort page: real temp/humidity, a static comfort-zone bar with a marker (no control - these sensors don't take a setpoint). */
  function pageComfort(ctx, cfg) {
    var t = T(ctx);
    var tEl = h('div.ow-big'), tUnit = h('span.ow-unit'), marker = h('div.ow-zone-dot'), hVal = h('b'), hRow = h('div.ow-sub-row', null, h('span', { html: UI.icon('drop', 20) }), h('span', null, t('owl.humidity')), hVal);
    var page = h('div.ow-page.ow-comfort',
      h('div.ow-head', null, h('span', { html: UI.icon('thermo', 22) }), h('span', null, t('owl.comfort'))),
      h('div.ow-bigrow', null, tEl, tUnit),
      h('div.ow-zone', null, h('div.ow-zone-track'), marker),
      h('div.ow-zone-labels', null, h('span', null, t('owl.cooler')), h('span', null, t('owl.warmer'))),
      hRow);
    function draw() {
      var tv = num(ctx, cfg.tempEntity), hv = num(ctx, cfg.humidityEntity);
      tEl.textContent = tv != null ? Math.round(tv) : '--'; tUnit.textContent = cfg.tempEntity ? (unitOf(ctx, cfg.tempEntity) || '°') : '';
      hVal.textContent = hv != null ? Math.round(hv) + '%' : '--';
      var frac = tv != null ? Math.max(0, Math.min(1, (tv - 60) / (80 - 60))) : 0.5;   // 60-80F comfort span, purely cosmetic
      marker.style.left = (6 + frac * 88) + '%';
    }
    draw();
    return { el: page, update: draw };
  }

  /** sleepLabel(state) -> a readable word for idomp/owlet's sleep_state values ("awake", "asleep", ...), else the raw state. */
  function sleepLabel(t, state) {
    var k = { awake: 'owl.sleep_awake', asleep: 'owl.sleep_asleep', deep_sleep: 'owl.sleep_deep', light_sleep: 'owl.sleep_light' }[String(state || '').toLowerCase()];
    return k ? t(k) : (state || '--');
  }

  function pageMorning(ctx, cfg) {
    var t = T(ctx), ids = sockIds(cfg);
    if (!ids) {
      return { el: h('div.ow-page.ow-morning',
        h('div.ow-head', null, h('span', { html: UI.icon('moon', 22) }), h('span', null, t('owl.morning')), h('span.ow-demo', null, t('owl.demo'))),
        ring(DEMO.restful, t('owl.restful')),
        h('div.ow-sub-row.ow-center', null, h('b', null, t('owl.total_sleep') + ': ' + fmtHm(DEMO.totalSleepMin)))), update: function () {} };
    }
    // real sock, no fake sleep-session math (no real data for that exists yet): just what the sock reports right now
    var state = h('b'), batt = h('b'), skin = h('b');
    var page = h('div.ow-page.ow-morning',
      h('div.ow-head', null, h('span', { html: UI.icon('moon', 22) }), h('span', null, t('owl.morning'))),
      h('div.ow-sub-row', null, h('span', { html: UI.icon('moon', 20) }), h('span', null, t('owl.sleep_state')), state),
      h('div.ow-sub-row', null, h('span', { html: UI.icon('battery', 20) }), h('span', null, t('owl.battery')), batt),
      h('div.ow-sub-row', null, h('span', { html: UI.icon('thermo', 20) }), h('span', null, t('owl.skin_temp')), skin));
    function draw() {
      var ss = ctx.state(ids.sleepState), bv = num(ctx, ids.batteryPct), sv = num(ctx, ids.skinTemp);
      state.textContent = ss && ss.state !== 'unavailable' ? sleepLabel(t, ss.state) : '--';
      battInto(batt, ctx, ids, t);
      skin.textContent = sv != null ? Math.round(sv) + (unitOf(ctx, ids.skinTemp) || '°') : '--';
    }
    draw();
    return { el: page, update: draw };
  }

  function pageTrends(ctx, cfg) {
    var t = T(ctx), labels = weekdayLabels(ctx.lang()), demoLabel = sockIds(cfg) ? t('owl.demo_history') : t('owl.demo');
    return { el: h('div.ow-page.ow-trends',
      h('div.ow-head', null, h('span', { html: UI.icon('gauge', 22) }), h('span', null, t('owl.trends')), h('span.ow-demo', null, demoLabel)),
      h('div.ow-subhead', null, t('owl.longest')), barChart(DEMO.stretch, 12, labels, function (v) { return v + 'h'; }),
      h('div.ow-subhead', null, t('owl.wakings')), dotRow(DEMO.wakings, 5, labels)), update: function () {} };
  }

  function pageHealth(ctx, cfg) {
    var t = T(ctx), labels = weekdayLabels(ctx.lang()), ids = sockIds(cfg);
    if (!ids) {
      return { el: h('div.ow-page.ow-health',
        h('div.ow-head', null, h('span', { html: UI.icon('lungs', 22) }), h('span', null, t('owl.health')), h('span.ow-demo', null, t('owl.demo'))),
        h('div.ow-subhead', null, t('owl.oxygen')), barChart(DEMO.oxygen, 100, labels, function (v) { return v + '%'; }),
        h('div.ow-sub-row', null, h('span', { html: UI.icon('heart', 20) }), h('span', null, t('owl.pulse') + ' · ' + t('owl.today_avg')), h('b', null, DEMO.pulse + ' bpm'))), update: function () {} };
    }
    // real sock: the actual current heart rate / oxygen the sock just reported, no invented weekly history (none exists yet)
    var hrEl = h('b'), o2El = h('b'), o2AvgEl = h('b');
    var page = h('div.ow-page.ow-health',
      h('div.ow-head', null, h('span', { html: UI.icon('lungs', 22) }), h('span', null, t('owl.health')), h('span.ow-demo', null, t('owl.now'))),
      h('div.ow-sub-row', null, h('span', { html: UI.icon('heart', 20) }), h('span', null, t('owl.pulse')), hrEl),
      h('div.ow-sub-row', null, h('span', { html: UI.icon('lungs', 20) }), h('span', null, t('owl.oxygen')), o2El),
      h('div.ow-sub-row', null, h('span', { html: UI.icon('lungs', 20) }), h('span', null, t('owl.oxygen') + ' (10 min Ø)'), o2AvgEl));
    function draw() {
      var hr = num(ctx, ids.heartRate), o2 = num(ctx, ids.o2), o2a = num(ctx, ids.o2Avg);
      hrEl.textContent = hr != null ? Math.round(hr) + ' bpm' : '--';
      o2El.textContent = o2 != null ? Math.round(o2) + '%' : '--';
      o2AvgEl.textContent = o2a != null ? Math.round(o2a) + '%' : '--';
    }
    draw();
    return { el: page, update: draw };
  }

  function pagePositions(ctx, cfg) {
    var t = T(ctx), p = DEMO.positions, max = Math.max(p.back, p.tummy, p.side) || 1, demoLabel = sockIds(cfg) ? t('owl.demo_unsupported') : t('owl.demo');
    function row(label, v) { return h('div.ow-posrow', null, h('span.ow-posl', null, label), h('div.ow-postrack', null, h('div.ow-posfill', { style: { width: Math.round((v / max) * 100) + '%' } })), h('span.ow-posv', null, v.toFixed(1) + 'h')); }
    return { el: h('div.ow-page.ow-positions',
      h('div.ow-head', null, h('span', { html: UI.icon('person', 22) }), h('span', null, t('owl.positions')), h('span.ow-demo', null, demoLabel)),
      row(t('owl.back'), p.back), row(t('owl.tummy'), p.tummy), row(t('owl.side'), p.side)), update: function () {} };
  }

  /** reconcileRecording(ctx, cfg): the Settings toggle (cameras.owlet.recordOn, a plain app preference) is the one
   *  place this turns on or off - nothing on the camera's own live view. Call this on every regular tick (buildCard's
   *  draw() in okie-cameras.js already runs one) so the real recorder entity tracks what Settings says, whether or
   *  not anyone has this camera open. Does nothing until cfg.recordingEntity is actually configured. */
  function reconcileRecording(ctx, cfg) {
    if (!cfg || !cfg.recordingEntity) return;
    var want = !!((ctx.settings.get().cameras || {}).owlet || {}).recordOn;
    var st = ctx.state(cfg.recordingEntity), have = !!st && st.state === 'on';
    if (st && have !== want) ctx.call(cfg.recordingEntity.split('.')[0], want ? 'turn_on' : 'turn_off', { entity_id: cfg.recordingEntity }).catch(function () {});
  }

  /**
   * panel(ctx, cfg) -> { el, update(), dispose() }: the right-hand glass column.
   * Tabs use the same pill menu every detail view already has (.dt-bar/.dt-tab, okie-detail.js):
   *   Comfort   - this camera's own room sensors (real data)
   *   Overview  - how last night went: the morning summary and the sleep positions together
   *   Trends    - the two weekly charts (sleep length/wakings, oxygen/pulse) together
   * Demo cards inside a tab stack vertically; nothing is force-stretched to fill the column.
   */
  function panel(ctx, cfg) {
    var t = T(ctx);
    var comfort = pageComfort(ctx, cfg), morning = pageMorning(ctx, cfg), positions = pagePositions(ctx, cfg), trends = pageTrends(ctx, cfg), health = pageHealth(ctx, cfg);
    var tabs = [
      { id: 'comfort', icon: 'thermo', label: t('owl.comfort'), parts: [comfort] },
      { id: 'overview', icon: 'moon', label: t('owl.morning'), parts: [morning, positions] },
      { id: 'trends', icon: 'gauge', label: t('owl.trends'), parts: [trends, health] },
    ];
    var bar = h('div.dt-bar', { role: 'tablist' });
    var host = h('div.ow-host');
    var cur = tabs[0].id;
    function draw() {
      host.innerHTML = '';
      var tab = tabs.filter(function (x) { return x.id === cur; })[0] || tabs[0];
      tab.parts.forEach(function (p) { host.appendChild(p.el); });
      Array.prototype.forEach.call(bar.children, function (b) { b.classList.toggle('on', b.dataset.tab === tab.id); });
    }
    tabs.forEach(function (tb) {
      bar.appendChild(h('button.dt-tab', { type: 'button', role: 'tab', dataset: { tab: tb.id }, 'aria-label': tb.label, title: tb.label, onclick: function () { if (ctx.haptic) ctx.haptic(10); cur = tb.id; draw(); } }, h('span', { html: UI.icon(tb.icon, 20) })));
    });
    draw();
    var root = h('div.ow-panel', bar, host);
    return {
      el: root,
      update: function () { [comfort, morning, positions, trends, health].forEach(function (p) { p.update(); }); },
      dispose: function () {},
    };
  }

  /** liveBadge(ctx, cfg) -> a small node for the live view's top-right corner: this camera's own temp + humidity, Owlet's own layout redrawn in Okie's icons. */
  function liveBadge(ctx, cfg) {
    var tEl = h('b'), hEl = h('b');
    var el = h('div.ow-badge',
      h('span.ow-badge-i', null, h('span', { html: UI.icon('thermo', 16) }), tEl),
      h('span.ow-badge-i', null, h('span', { html: UI.icon('drop', 16) }), hEl));
    function draw() {
      var tv = num(ctx, cfg.tempEntity), hv = num(ctx, cfg.humidityEntity);
      tEl.textContent = tv != null ? Math.round(tv) + '°' : '--'; hEl.textContent = hv != null ? Math.round(hv) + '%' : '--';
    }
    draw();
    return { el: el, update: draw };
  }

  /** buildCard(ctx) -> { el, update, dispose } | null: a standalone home-screen tile for the Dream Sock,
   *  separate from the camera (okie-bento.js wires it into the same swipeable deck as the Cameras/Sensors
   *  cards). Shows the sock's state at a glance; a tap opens the same Comfort/Overview/Trends panel the
   *  camera's own live view uses. Null until a Dream Sock actually exists (see sockOnlyConfig). */
  function buildCard(ctx) {
    var t = T(ctx), cfg = sockOnlyConfig(ctx);
    if (!cfg) return null;
    var ids = sockIds(cfg);
    var state = h('div.owc-state'), batt = h('div.owc-batt');
    var el = h('section.device-list-item.owc', { role: 'button', tabindex: '0', 'aria-label': t('owl.sock_title') },
      h('div.owc-head', null, h('span', { html: UI.icon('heart', 20) }), h('span.owc-title', null, t('owl.sock_title'))),
      state, batt);
    function draw() {
      var live = sockLive(ctx, ids), ss = ctx.state(ids.sleepState), bv = num(ctx, ids.batteryPct);
      state.textContent = live ? sleepLabel(t, ss && ss.state) : t('owl.sock_idle');
      if (bv != null) battInto(batt, ctx, ids, t); else batt.textContent = '';
      el.classList.toggle('live', live);
    }
    function open() { if (ctx.haptic) ctx.haptic(10); ctx.openApp('owlet'); }
    el.addEventListener('click', open);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    draw();
    return { el: el, update: draw, dispose: function () {} };
  }

  /** bootieArt() -> an ORIGINAL drawing of a baby sock monitor, in the pose of the user's reference banner: an ankle
   *  bootie seen three-quarters, the opening on top and the foot opening low left (soft cream lining in both), a wide wrap
   *  strap across the middle, a round sensor on the side, a fabric texture. Drawn from scratch with its own shapes - no
   *  brand mark, not a trace of any product photo. Only the light around it is CSS (.owf-glow / .owh-glow). */
  var artN = 0;
  function bootieArt() {
    var n = 'ob' + (++artN), u = function (k) { return 'url(#' + n + k + ')'; };
    return '<svg viewBox="28 18 262 300" width="262" height="300" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="' + n + 'b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#dcebe0"/><stop offset=".45" stop-color="#b3d0bc"/><stop offset="1" stop-color="#7c9f88"/></linearGradient>' +
      '<linearGradient id="' + n + 's" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#9fbfaa"/><stop offset=".55" stop-color="#c8dfcf"/><stop offset="1" stop-color="#a9c8b3"/></linearGradient>' +
      '<linearGradient id="' + n + 'f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e3efe6"/><stop offset="1" stop-color="#b6d1be"/></linearGradient>' +
      '<radialGradient id="' + n + 'i" cx=".55" cy=".35" r=".75"><stop offset="0" stop-color="#d9d3c6"/><stop offset=".7" stop-color="#bdb6a8"/><stop offset="1" stop-color="#8f897d"/></radialGradient>' +
      '<radialGradient id="' + n + 'p" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#eef1ef"/><stop offset="1" stop-color="#c9d0cc"/></radialGradient>' +
      '<filter id="' + n + 't" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 .3  0 0 0 0 .38  0 0 0 0 .33  0 0 0 .55 0" result="g"/><feComposite in="g" in2="SourceGraphic" operator="in" result="m"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="m"/></feMerge></filter>' +
      '</defs>' +
      '<g filter="' + u('t') + '">' +
      '<path d="M118 62C100 118 74 166 60 230C52 266 68 300 110 306L204 300C244 292 270 252 276 200C282 150 286 104 284 74Z" fill="' + u('b') + '"/>' +      // the bootie
      '<path d="M66 228C80 176 102 128 120 78" stroke="#eaf3ec" stroke-width="5" fill="none" opacity=".45" stroke-linecap="round"/>' +      // light on its left edge
      '<path d="M246 120C262 160 264 214 236 262" stroke="#5f8370" stroke-width="7" fill="none" opacity=".18" stroke-linecap="round"/>' +      // shade on its right
      '<ellipse cx="201" cy="62" rx="86" ry="36" transform="rotate(-8 201 62)" fill="' + u('f') + '"/>' +      // the cuff of the top opening
      '<ellipse cx="205" cy="62" rx="70" ry="24" transform="rotate(-8 205 62)" fill="' + u('i') + '"/>' +      // its lining
      '<path d="M120 92C150 108 170 136 178 162L142 176C134 146 118 122 98 110Z" fill="' + u('f') + '" opacity=".95"/>' +      // the folded flap
      '<path d="M128 112L132 104M140 124L146 118M150 140L157 135" stroke="#7c9f88" stroke-width="2" opacity=".5" stroke-linecap="round"/>' +      // its stitches
      '<path d="M40 206C92 172 150 150 210 148L222 198C168 200 108 224 64 262Z" fill="' + u('s') + '"/>' +      // the wrap strap
      '<path d="M48 214C98 182 152 162 212 160" stroke="#eaf3ec" stroke-width="2.4" fill="none" opacity=".55" stroke-dasharray="4 5" stroke-linecap="round"/>' +      // its stitching
      '<ellipse cx="98" cy="286" rx="48" ry="25" transform="rotate(16 98 286)" fill="#c2d9c8"/>' +      // the foot opening
      '<ellipse cx="100" cy="287" rx="37" ry="16" transform="rotate(16 100 287)" fill="' + u('i') + '"/>' +
      '</g>' +
      '<ellipse cx="238" cy="230" rx="41" ry="40" fill="#6c8d79" opacity=".35"/>' +      // the sensor's shadow on the fabric
      '<circle cx="233" cy="223" r="40" fill="' + u('p') + '"/>' +      // the sensor
      '<circle cx="233" cy="223" r="30" fill="none" stroke="#c3cbc6" stroke-width="1.6" opacity=".8"/>' +
      '<path d="M233 236s-11-7-11-14a6 6 0 0 1 11-3 6 6 0 0 1 11 3c0 7-11 14-11 14z" fill="none" stroke="#a7b2ab" stroke-width="2" opacity=".85"/>' +      // a small heart (our own mark)
      '<ellipse cx="220" cy="205" rx="12" ry="7" fill="#fff" opacity=".7"/>' +
      '</svg>';
  }

  /** sockArt() -> an ORIGINAL sock-shaped illustration: layered overlapping straps, a cream fleece
   *  interior peeking through the cuff opening, curved stitch lines, fold creases, and a gradient-shaded
   *  sensor module - drawn from scratch with its own shapes and gradients, not traced from or a copy of
   *  any real product's design. No shadow/glow is baked in here (just a soft contact shadow under the
   *  product, standard for a product illustration) - all lighting/glow stays in CSS (.owh-art). */
  function sockArt() {
    return '<svg viewBox="16 -7 131 169" width="131" height="169" aria-hidden="true">' +      // tight-cropped to the shapes' own bounds (measured via getBBox) so centering the element centers the visible sock, not a padded canvas
      '<defs>' +
      '<linearGradient id="owBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e3f5ea"/><stop offset="55%" stop-color="#a8d6bb"/><stop offset="100%" stop-color="#7fb496"/></linearGradient>' +
      '<linearGradient id="owCuff" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f6fbf8"/><stop offset="100%" stop-color="#cdeada"/></linearGradient>' +
      '<radialGradient id="owFleece" cx="40%" cy="35%" r="70%"><stop offset="0%" stop-color="#fbf6e9"/><stop offset="100%" stop-color="#e8dec7"/></radialGradient>' +
      '<linearGradient id="owStrap1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#b9e0c8"/><stop offset="100%" stop-color="#8bc0a0"/></linearGradient>' +
      '<linearGradient id="owStrap2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#a6d6ba"/><stop offset="100%" stop-color="#79ac8d"/></linearGradient>' +
      '<radialGradient id="owSensor" cx="34%" cy="28%" r="78%"><stop offset="0%" stop-color="#ffffff"/><stop offset="70%" stop-color="#eef4f0"/><stop offset="100%" stop-color="#d4e3da"/></radialGradient>' +
      '</defs>' +
      '<ellipse cx="82" cy="150" rx="44" ry="7" fill="#000" opacity=".16"/>' +      // contact shadow, part of the illustration itself
      '<ellipse cx="56" cy="20" rx="29" ry="16" fill="url(#owFleece)" transform="rotate(-16 56 20)"/>' +      // cream fleece interior, peeking through the opening
      '<path d="M58 10C46 10 36 20 36 32V76C36 104 59 127 87 127H108C124 127 137 114 137 98C137 84 128 72 115 69L90 62C81 59 75 51 75 42V32C75 20 65 10 53 10H58Z" fill="url(#owBody)" stroke="#86b89b" stroke-width="2"/>' +      // main body
      '<path d="M40 60C50 67 59 74 66 85" stroke="#6f9e82" stroke-width="2" fill="none" opacity=".3" stroke-linecap="round"/>' +      // fold creases, for material depth
      '<path d="M48 96C57 102 66 107 72 114" stroke="#6f9e82" stroke-width="2" fill="none" opacity=".22" stroke-linecap="round"/>' +
      '<path d="M30 42C30 29 41 18 54 18H72C85 18 94 29 94 42V55C81 61 43 61 30 55Z" fill="url(#owCuff)" stroke="#9fc9ae" stroke-width="2"/>' +      // rolled cuff fold, overlapping the body + fleece
      '<path d="M22 70C22 61 29 54 38 52L104 82C112 86 114 96 109 103C104 110 94 111 88 107L25 80C20 77 19 73 22 70Z" fill="url(#owStrap1)" stroke="#86b89b" stroke-width="2"/>' +      // main diagonal wrap strap (layer 1)
      '<path d="M30 69C30 65 33 62 37 61L98 87" stroke="#6f9e82" stroke-width="1.6" fill="none" opacity=".4" stroke-dasharray="3 3" stroke-linecap="round"/>' +      // its stitch line
      '<path d="M66 100C66 94 71 90 77 90L120 104C125 106 126 111 122 115C119 118 113 119 109 117L68 105C65 104 64 102 66 100Z" fill="url(#owStrap2)" stroke="#79ac8d" stroke-width="2"/>' +      // second, shorter overlapping strap (layer 2)
      '<circle cx="124" cy="110" r="19" fill="url(#owSensor)" stroke="#aed0c0" stroke-width="2.5"/>' +      // sensor module
      '<ellipse cx="118" cy="103" rx="7" ry="5" fill="#fff" opacity=".55"/>' +      // its highlight
      '<circle cx="124" cy="110" r="4.5" fill="#6fae85"/>' +      // its LED
      '</svg>';
  }

  /** ownerHeader(ctx, cfg, ids) -> { el, update }: the big banner on the Overview tab only - brand row
   *  (icon + "Owlet"), a large "Baby Monitor" headline, the sock's own name, a connected/live status row,
   *  the battery top-right (no frame, no "..."), and an original sock illustration on the right (see sockArt - never
   *  Owlet's own product photo). Text content is real data only (battery %, worn/live state). */
  function ownerHeader(ctx, cfg, ids) {
    var t = T(ctx);
    var battEl = h('b'), dot = h('span.owh-dot'), statusEl = h('span');
    var el = h('div.owh',
      h('div.owh-topbar', null,
        h('div.owh-brand', null, h('span.owh-ic', { html: UI.icon('heart', 18) }), h('span.owh-brand-t', null, 'Owlet')),
        h('div.owh-pills', null,
          h('span.owh-pill', null, battEl))),      // just the battery, as on the robot: no frame, no "..." (the user, 2026-11-19)
      h('div.owh-row', null,
        h('div.owh-text', null,
          h('div.owh-head', null, t('owl.baby_monitor')),
          h('div.owh-sub', null, t('owl.sock_title')),
          h('div.owh-status', null, dot, statusEl))),
      h('div.owh-glow'),
      h('div.owh-art-wrap', null, h('div.owh-art', { html: bootieArt() })));      // spans the whole hero (header row included), 43-70% across like the reference - no card behind it
    function draw() {
      var bv = num(ctx, ids.batteryPct), s = statusFor(ctx, cfg);
      battInto(battEl, ctx, ids, t);
      statusEl.textContent = ''; statusEl.appendChild(document.createTextNode(s.label + ' · ')); statusEl.appendChild(h('em.owh-tag', null, s.tag));
      el.dataset.level = s.level;
    }
    draw();
    return { el: el, update: draw };
  }

  /** statusFor(ctx, cfg) -> { level, label, tag }: the sock's state in words, for the banner's status row
   *  (label, then " · " and the coloured tag, like "Connected · Live"). level drives the colour of the dot,
   *  the tag and the pulsing light around the sock (see sockStatus). */
  function statusFor(ctx, cfg) {
    var t = T(ctx), s = sockStatus(function (id) { var st = ctx.state(id); return st ? st.state : undefined; }, cfg.sockPrefix);
    var L0 = s.level;
    if (L0 === 'green') return { level: L0, label: t('owl.connected'), tag: t('owl.live') };
    var tag = L0 === 'red' ? t('owl.tag_alert') : L0 === 'yellow' ? t('owl.tag_check') : L0 === 'blue' ? t('owl.tag_charging') : L0 === 'idle' ? t('owl.tag_idle') : t('owl.tag_off');
    return { level: L0, label: t('owl.st_' + s.why), tag: tag };
  }

  /** favCard(ctx) -> { el, update } | null: the Owlet Sock as ONE card in Favorites (and in a room), drawn from the
   *  user's reference banner (1166 x 352 there): brand top-left, battery top-right, "Baby Monitor" / "Owlet
   *  Smart Sock" / status on the left, the sock in the middle-right with a light behind it that pulses in the
   *  status colour. It sits on the TV card's size (.rc, 170px, 26px corners) and every size is in cqh of that height. */
  function favCard(ctx) {
    var t = T(ctx), cfg = sockOnlyConfig(ctx);
    if (!cfg) return null;
    var ids = sockIds(cfg);
    var battEl = h('b'), statusEl = h('span');
    var el = h('section.rc.owf', { role: 'button', tabindex: '0', 'aria-label': t('owl.baby_monitor') },
      h('div.owf-glow'),
      h('div.owf-art', { html: bootieArt() }),
      h('div.owf-brand', null, h('span.owf-ic', { html: UI.icon('heart', 24) }), h('span.owf-brand-t', null, 'Owlet')),
      h('div.owf-pills', null, h('span.owf-pill', null, battEl)),
      h('div.owf-text', null,
        h('div.owf-head', null, t('owl.baby_monitor')),
        h('div.owf-sub', null, t('owl.smart_sock')),
        h('div.owf-status', null, h('span.owf-dot'), statusEl)));
    function draw() {
      var bv = num(ctx, ids.batteryPct), s = statusFor(ctx, cfg);
      battInto(battEl, ctx, ids, t);
      statusEl.textContent = ''; statusEl.appendChild(document.createTextNode(s.label)); statusEl.appendChild(h('span.owf-sep', null, '·')); statusEl.appendChild(h('em.owf-tag', null, s.tag));
      el.dataset.level = s.level;
    }
    function open() { if (ctx.haptic) ctx.haptic(10); ctx.openApp('owlet'); }
    el.addEventListener('click', open);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    draw();
    return { el: el, update: draw };
  }

  /** pageLiveReadings(ctx, cfg): the sock's current heart rate + oxygen, large, with a Smart Sock status
   *  row underneath (battery, connected/live) - the app's own "Live" tab. Falls back to the existing demo
   *  weekly chart (pageHealth) when there is no sock at all, same honesty rule as everywhere else here. */
  function pageLiveReadings(ctx, cfg) {
    var t = T(ctx), ids = sockIds(cfg);
    if (!ids) return pageHealth(ctx, cfg);
    var hrEl = h('b.ow-stat-v'), o2El = h('b.ow-stat-v');
    var page = h('div.ow-page.ow-livecard',
      h('div.ow-head', null, h('span', { html: UI.icon('heart', 22) }), h('span', null, t('owl.live_readings')), h('span.ow-livepill', null, t('owl.live'))),
      h('div.ow-live-row', null,
        h('div.ow-stat', null, h('span', { html: UI.icon('heart', 20) }), hrEl, h('span.ow-stat-l', null, t('owl.pulse'))),
        h('div.ow-stat', null, h('span', { html: UI.icon('lungs', 20) }), o2El, h('span.ow-stat-l', null, t('owl.oxygen')))),
      h('div.ow-pulseline', null, h('div.ow-pulseline-i')));
    function draw() {
      var hr = num(ctx, ids.heartRate), o2 = num(ctx, ids.o2);
      hrEl.textContent = hr != null ? Math.round(hr) : '--';
      o2El.textContent = o2 != null ? Math.round(o2) + '%' : '--';
      page.classList.toggle('live', sockLive(ctx, ids));
    }
    draw();
    return { el: page, update: draw };
  }

  /** pageSockStatus(ctx, cfg): a small "Smart Sock" status row - battery + connected/live, the Live tab's
   *  second card, matching the brand header's pills but as its own standalone card. */
  function pageSockStatus(ctx, cfg) {
    var t = T(ctx), ids = sockIds(cfg);
    var battEl = h('b'), dot = h('span.owh-dot'), stEl = h('span');
    var el = h('div.ow-sockcard',
      h('span.ow-sock-ic', { html: UI.icon('battery', 22) }),
      h('div.ow-sock-txt', null, h('b', null, t('owl.sock_title')), h('div.ow-sock-sub', null, battEl, h('span', null, ' · '), dot, stEl)));
    function draw() {
      var live = ids && sockLive(ctx, ids), bv = ids ? num(ctx, ids.batteryPct) : null;
      battInto(battEl, ctx, ids, t);
      stEl.textContent = live ? t('owl.connected') : t('owl.sock_idle');
      dot.classList.toggle('on', !!live);
    }
    draw();
    return { el: el, update: draw };
  }

  /** pageSleepCard(ctx, cfg): a bigger, status-pill styled version of the sleep state than pageMorning -
   *  the app's own "Sleep" tab header card (still only what the sock actually reports). */
  function pageSleepCard(ctx, cfg) {
    var t = T(ctx), ids = sockIds(cfg);
    var pillEl = h('span.ow-livepill'), stateEl = h('div.ow-sleep-state'), battB = h('b'), skinB = h('b');
    var page = h('div.ow-page.ow-sleepcard',
      h('div.ow-head', null, h('span', { html: UI.icon('moon', 22) }), h('span', null, t('owl.morning')), pillEl),
      stateEl,
      h('div.ow-sub-row', null, h('span', { html: UI.icon('battery', 18) }), h('span', null, t('owl.battery')), battB),
      h('div.ow-sub-row', null, h('span', { html: UI.icon('thermo', 18) }), h('span', null, t('owl.skin_temp')), skinB));
    function draw() {
      if (!ids) { stateEl.textContent = '--'; pillEl.textContent = t('owl.demo'); battB.textContent = '--'; skinB.textContent = '--'; return; }
      var live = sockLive(ctx, ids), ss = ctx.state(ids.sleepState), bv = num(ctx, ids.batteryPct), sv = num(ctx, ids.skinTemp);
      stateEl.textContent = live ? sleepLabel(t, ss && ss.state) : t('owl.sock_idle');
      pillEl.textContent = live ? t('owl.live') : '';
      battInto(battB, ctx, ids, t);
      skinB.textContent = sv != null ? Math.round(sv) + (unitOf(ctx, ids.skinTemp) || '°') : '--';
    }
    draw();
    return { el: page, update: draw };
  }

  /** pagePositionsBar(ctx, cfg): the same demo sleep-position data as pagePositions(), drawn as one
   *  segmented bar with a legend instead of three separate rows - still honestly demo-labeled, this sock
   *  never reports real positions (see sockIds doc). Used only by the app's own "Sleep" tab. */
  function pagePositionsBar(ctx, cfg) {
    var t = T(ctx), p = DEMO.positions, total = p.back + p.tummy + p.side, demoLabel = sockIds(cfg) ? t('owl.demo_unsupported') : t('owl.demo');
    var segs = [{ k: 'back', v: p.back, c: '#8ef0c0' }, { k: 'tummy', v: p.tummy, c: '#ffcf5c' }, { k: 'side', v: p.side, c: '#30d6c4' }];
    var bar = h('div.ow-segbar', null, segs.map(function (s) { return h('div.ow-seg', { style: { flex: String(s.v / total), background: s.c } }); }));
    var legend = h('div.ow-seglegend', null, segs.map(function (s) { return h('span.ow-segitem', null, h('i', { style: { background: s.c } }), t('owl.' + s.k) + ' ' + Math.round(s.v / total * 100) + '%'); }));
    return { el: h('div.ow-page.ow-positions2',
      h('div.ow-head', null, h('span', { html: UI.icon('person', 22) }), h('span', null, t('owl.positions')), h('span.ow-demo', null, demoLabel)),
      bar, legend), update: function () {} };
  }

  /** pageOwletSettings(ctx, cfg): the app's own "Settings" tab - just the recording switch (when a recorder
   *  entity is configured), reusing the exact same .ios-switch look as the real Settings app (its CSS is
   *  already global, injected once by okie-settings.js); a link to the full Settings app for everything else. */
  function pageOwletSettings(ctx, cfg) {
    var t = T(ctx);
    var rows = [];
    if (cfg.recordingEntity) {
      var want = !!((ctx.settings.get().cameras || {}).owlet || {}).recordOn;
      var sw = h('button.ios-switch' + (want ? '.on' : ''), { role: 'switch', 'aria-checked': want ? 'true' : 'false', 'aria-label': t('owl.recording') }, h('span.dot'));
      sw.addEventListener('click', function () {
        var nv = !(sw.getAttribute('aria-checked') === 'true');
        sw.classList.toggle('on', nv); sw.setAttribute('aria-checked', nv ? 'true' : 'false');
        if (ctx.haptic) ctx.haptic(8);
        ctx.settings.set({ cameras: { owlet: { recordOn: nv } } });
      });
      rows.push(h('div.ow-sub-row', null, h('span', { html: UI.icon('camera', 18) }), h('span', null, t('owl.recording')), sw));
    }
    var openBtn = h('button.ow-settings-link', { type: 'button', onclick: function () { ctx.openApp('settings'); } }, t('owl.more_settings'));
    return { el: h('div.ow-page.ow-settingspage',
      h('div.ow-head', null, h('span', { html: UI.icon('gear', 22) }), h('span', null, t('card.settings'))),
      rows.length ? h('div', null, rows) : null, openBtn), update: function () {} };
  }

  // ------------------------------------------------ real history of the sock (no made-up numbers) ----
  /** sockHist(ctx, ids, hours) -> Promise<{ hr: [[t, v]], o2: [[t, v]], ss: [[t, state]], mv: [[t, v]] }> from Home Assistant's
   *  recorder (history/history_during_period, minimal). Cached for a minute: the pages redraw every 15 s. */
  var histC = {};
  function moveId(ctx) {      // the sock's Movement sensor: Home Assistant ships it switched off; the user turns it on (we never change his setup)
    var hs = ctx.hass(), st = (hs && hs.states) || {}, k = Object.keys(st).filter(function (id) { return /^sensor\.[a-z0-9_]*owlet_sock[a-z0-9_]*_movement$/.test(id); })[0];
    return k || null;
  }
  function sockHist(ctx, ids, hours) {
    var mv = moveId(ctx), list = [ids.heartRate, ids.o2, ids.sleepState, ids.skinTemp, ids.signal].concat(mv ? [mv] : []), key = list.join() + '|' + hours, c = histC[key];
    if (c && Date.now() - c.at < 60000) return c.p;
    var start = new Date(Date.now() - hours * 3600e3).toISOString();
    var p = Promise.resolve(ctx.callWS({ type: 'history/history_during_period', start_time: start, entity_ids: list, minimal_response: true, no_attributes: true, significant_changes_only: false })).then(function (res) {
      res = res || {};
      var rows = function (id) { return (res[id] || []).map(function (r) { return [(r.lu || r.lc || 0) * 1000, r.s]; }); };
      var nums = function (id) { return rows(id).map(function (r) { return [r[0], parseFloat(r[1])]; }).filter(function (r) { return isFinite(r[1]); }); };
      return { hr: nums(ids.heartRate), o2: nums(ids.o2), ss: rows(ids.sleepState), st: nums(ids.skinTemp), sig: nums(ids.signal), mv: mv ? nums(mv) : null };
    }, function () { delete histC[key]; return { hr: [], o2: [], ss: [], st: [], sig: [], mv: null }; });
    histC[key] = { at: Date.now(), p: p }; return p;
  }
  /** sleepSession(ss, now) -> null | { start, end, deep, light, awake, wakings, segs: [[from, to, state]] } (ms)
   *  The latest stretch of sleep in the sleep-state history: light and deep sleep, with awake gaps shorter than
   *  30 minutes counted as wakings inside it. A longer awake time, or no readings, ends it. */
  var SLEEPY = { light_sleep: 1, deep_sleep: 1 };
  function sleepSession(ss, now) {
    var segs = [];
    for (var i = 0; i < ss.length; i++) { var a = ss[i], b = ss[i + 1]; segs.push([a[0], b ? b[0] : now, a[1]]); }
    var end = -1;
    for (var j = segs.length - 1; j >= 0; j--) { if (SLEEPY[segs[j][2]]) { end = j; break; } if (segs[j][2] === 'awake' && segs[j][1] - segs[j][0] < 30 * 60000) continue; if (segs[j][1] - segs[j][0] > 30 * 60000) break; }
    if (end < 0) return null;
    var startI = end;
    for (var k = end - 1; k >= 0; k--) {
      var s = segs[k];
      if (SLEEPY[s[2]]) { startI = k; continue; }
      if (s[2] === 'awake' && s[1] - s[0] < 30 * 60000 && k > 0 && SLEEPY[segs[k - 1][2]]) continue;
      break;
    }
    var out = { start: segs[startI][0], end: segs[end][1], deep: 0, light: 0, awake: 0, wakings: 0, segs: segs.slice(startI, end + 1) };
    out.segs.forEach(function (x) { var d = x[1] - x[0]; if (x[2] === 'deep_sleep') out.deep += d; else if (x[2] === 'light_sleep') out.light += d; else { out.awake += d; out.wakings++; } });
    return out;
  }
  function fmtDur(ms) { var m = Math.round(ms / 60000); return { h: Math.floor(m / 60), m: m % 60 }; }
  /** A soft line through the last readings, with a glow under it (the vitals cards). */
  function waveSvg(pts, color, id) {
    var W = 300, H = 60;
    if (!pts || pts.length < 2) return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><path d="M0 ' + H / 2 + 'H' + W + '" stroke="' + color + '" stroke-opacity=".25" stroke-width="2" fill="none" stroke-dasharray="4 6"/></svg>';
    var t0 = pts[0][0], t1 = pts[pts.length - 1][0], vs = pts.map(function (p) { return p[1]; }), lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), pad = Math.max(1, (hi - lo) * 0.25);
    lo -= pad; hi += pad;
    var xy = pts.map(function (p) { return [((p[0] - t0) / Math.max(1, t1 - t0)) * W, H - 6 - ((p[1] - lo) / (hi - lo)) * (H - 12)]; });
    var d = 'M' + xy[0][0].toFixed(1) + ' ' + xy[0][1].toFixed(1);
    for (var i = 1; i < xy.length; i++) { var p0 = xy[i - 1], p1 = xy[i], mx = (p0[0] + p1[0]) / 2; d += ' C' + mx.toFixed(1) + ' ' + p0[1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + p1[1].toFixed(1) + ' ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1); }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".28"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<filter id="' + id + 'b" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>' +
      '<path d="' + d + ' L' + W + ' ' + H + ' L0 ' + H + 'Z" fill="url(#' + id + ')"/><path d="' + d + '" stroke="' + color + '" stroke-width="6" stroke-opacity=".7" fill="none" filter="url(#' + id + 'b)"/><path d="' + d + '" stroke="' + color + '" stroke-width="2.6" fill="none" vector-effect="non-scaling-stroke"/></svg>';
  }
  /** The baby: name and age from the Owlet settings (birth date), else the sock's own name. */
  function babyLine(ctx, t) {
    var o = ctx.settings.get().owlet || {}, name = (o.babyName || '').trim(), bd = o.birthDate ? Date.parse(o.birthDate) : NaN, age = '';
    if (isFinite(bd)) { var days = Math.floor((Date.now() - bd) / 864e5); age = days < 14 ? t('owl.age_d', { n: days }) : days < 61 ? t('owl.age_w', { n: Math.floor(days / 7) }) : days < 731 ? t('owl.age_m', { n: Math.floor(days / 30.44) }) : t('owl.age_y', { n: Math.floor(days / 365.25) }); }
    return [name, age].filter(Boolean).join(' • ') || t('owl.smart_sock');
  }

  /** pageDashboard(ctx, cfg, ids) -> { el }: the Overview tab, the user's "Health Dashboard" reference (2026-11-19):
   *  brand line, big title, baby + age, live status, the sock with its status light, battery + connection top-right;
   *  then Heart Rate and Oxygen cards with the last two hours as a line, the night's sleep with its stages,
   *  Activity (the sock's own movement sensor) and Daily Progress. Every number is the sock's or worked out from its history. */
  function pageDashboard(ctx, cfg, ids) {
    var t = T(ctx), now = Date.now();
    var battEl = h('span.owd-batt'), connEl = h('span.owd-conn'), statusEl = h('span');
    var head = h('div.owh.owd-head',
      h('div.owd-left', null,
        h('div.owh-brand', null, h('span.owh-ic', { html: UI.icon('heart', 18) }), h('span.owh-brand-t', null, 'Owlet')),
        h('div.owd-title', null, t('owl.dash_title')),
        h('div.owd-baby', null, babyLine(ctx, t)),
        h('div.owh-status.owd-status', null, h('span.owh-dot'), statusEl)),
      h('div.owh-glow'),
      h('div.owh-art-wrap', null, h('div.owh-art', { html: bootieArt() })),
      h('div.owd-right', null, battEl, connEl));
    var s = statusFor(ctx, cfg), live = sockLive(ctx, ids);
    head.dataset.level = s.level;
    statusEl.textContent = s.level === 'green' ? t('owl.live_mon') : s.label;
    battInto(battEl, ctx, ids, t);
    connEl.appendChild(h('span.owh-dot')); connEl.appendChild(document.createTextNode(s.level === 'off' ? t('owl.tag_off') : t('owl.connected')));
    function vital(icon, val, unit, label, color, cls) {
      var wave = h('div.owd-wave');
      var card = h('div.ow-page.owd-vital.' + cls, null,
        h('div.owd-vtop', null, h('span.owd-vic', { html: UI.icon(icon, 56) }), h('div', null, h('div.owd-vnum', null, h('b', null, val), h('span', null, unit)), h('div.owd-vlab', null, label))), wave);
      return { el: card, wave: wave };
    }
    var hrV = num(ctx, ids.heartRate), o2V = num(ctx, ids.o2);
    var hr = vital('heart', live && hrV != null ? Math.round(hrV) : '--', 'bpm', t('owl.hr'), '#5ee08f', 'owd-hr');
    var o2 = vital('lungs', live && o2V != null ? Math.round(o2V) : '--', '%', t('owl.o2_long'), '#4fd6e8', 'owd-o2');
    var sleepNum = h('div.owd-snum', null, '--'), sleepSince = h('div.owd-ssince'), stageBar = h('div.owd-stages'), legend = h('div.owd-legend');
    var sleepCard = h('div.ow-page.owd-sleep', null,
      h('span.owd-sic', { html: UI.icon('bed', 56) }),
      h('div.owd-sl', null, h('div.owd-sh', null, t('owl.sleep'), h('span', { html: UI.icon('moon', 15) })), sleepNum, sleepSince),
      h('div.owd-sr', null, stageBar, legend));
    var actNum = h('div.owd-anum', null, '--'), actSub = h('div.owd-asub'), actBars = h('div.owd-abars');
    var actCard = h('div.ow-page.owd-act', null, h('div.owd-ah', null, h('span', { html: UI.icon('steps', 36) }), h('div', null, h('div.owd-at', null, t('owl.activity')), actNum, actSub)), actBars);
    var ringIn = h('div.owd-ring', { html: '<svg viewBox="0 0 100 100"><defs><filter id="owdrg" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="8"/><circle class="g" cx="50" cy="50" r="42" fill="none" stroke="#3fe0b0" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100" filter="url(#owdrg)" opacity=".75" transform="rotate(-90 50 50)"/><circle class="a" cx="50" cy="50" r="42" fill="none" stroke="#3fe0b0" stroke-width="8" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 50 50)"/></svg>' }), ringV = h('b.owd-ringv', null, '--'), ring = h('div.owd-ringw', null, ringIn, ringV), plist = h('div.owd-plist');
    var progCard = h('div.ow-page.owd-prog', null, h('div.owd-ph', null, h('span', { html: UI.icon('calendar', 32) }), h('span', null, t('owl.progress'))), h('div.owd-pbody', null, ring, plist));
    tapOpen(hr.el, ctx, ids.heartRate); tapOpen(o2.el, ctx, ids.o2);
    var el = h('div.owd', null, head, h('div.owd-row2', null, hr.el, o2.el), sleepCard, h('div.owd-row3', null, actCard, progCard));
    var goalH = +((ctx.settings.get().owlet || {}).sleepGoalH) || 10;
    function prow(color, label, value) { return h('div.owd-prow', null, h('i', { style: { background: color } }), h('span', null, label), h('b', null, value)); }
    sockHist(ctx, ids, 24).then(function (H) {
      var last2 = function (a) { return a.filter(function (p) { return p[0] > now - 2 * 3600e3; }); };
      hr.wave.innerHTML = waveSvg(last2(H.hr), '#5ee08f', 'owdg-hr'); o2.wave.innerHTML = waveSvg(last2(H.o2), '#4fd6e8', 'owdg-o2');
      var ses = sleepSession(H.ss, now), slept = ses ? ses.deep + ses.light : 0;
      if (ses) {
        var d = fmtDur(slept); sleepNum.innerHTML = '<b>' + d.h + '</b><span>h</span> <b>' + d.m + '</b><span>m</span>';
        sleepSince.textContent = t('owl.since', { t: new Date(ses.start).toLocaleTimeString(ctx.lang(), { hour: 'numeric', minute: '2-digit' }) });
        var tot = Math.max(1, ses.deep + ses.light + ses.awake), parts = [['deep', ses.deep, 'var(--owd-deep)'], ['light', ses.light, 'var(--owd-light)'], ['awake', ses.awake, 'var(--owd-awake)']];
        stageBar.innerHTML = ''; legend.innerHTML = '';
        parts.forEach(function (p) { var pc = Math.round(p[1] / tot * 100); stageBar.appendChild(h('i', { style: { width: pc + '%', background: p[2] } })); legend.appendChild(h('span', null, h('i', { style: { background: p[2] } }), t('owl.st_' + p[0]) + ' ', h('b', null, pc + '%'))); });
      } else { sleepSince.textContent = t('owl.no_sleep'); stageBar.innerHTML = ''; legend.innerHTML = ''; }
      // Activity: minutes with movement in the last 24 h, from the sock's Movement sensor (off in Home Assistant until the user turns it on)
      var activeMin = null;
      if (H.mv && H.mv.length) {
        activeMin = 0; var bins = [];
        for (var i = 0; i < 12; i++) bins.push(0);
        H.mv.forEach(function (p, i) { var nx = H.mv[i + 1] ? H.mv[i + 1][0] : now, dur = (nx - p[0]) / 60000; if (p[1] > 0) { activeMin += dur; var b = Math.floor((now - p[0]) / (2 * 3600e3)); if (b >= 0 && b < 12) bins[11 - b] += dur; } });
        activeMin = Math.round(activeMin); actNum.innerHTML = '<b>' + activeMin + '</b><span>' + t('owl.min') + '</span>'; actSub.textContent = t('owl.active_time');
        var mx = Math.max.apply(null, bins.concat([1])); actBars.innerHTML = ''; bins.forEach(function (v) { actBars.appendChild(h('i', { style: { height: Math.max(6, v / mx * 100) + '%' } })); });
      } else { actSub.textContent = t('owl.move_off'); actBars.innerHTML = ''; }
      // Daily Progress: the night's sleep against the sleep goal (Settings); the vitals tick when the sock is reading now
      var pc = Math.min(100, Math.round(slept / (goalH * 3600e3) * 100));
      Array.prototype.forEach.call(ringIn.querySelectorAll('circle.a,circle.g'), function (c) { c.setAttribute('stroke-dasharray', pc + ' ' + (100 - pc)); }); ringV.textContent = ses ? pc + '%' : '--';
      plist.innerHTML = '';
      plist.appendChild(prow('var(--owd-light)', t('owl.sleep'), ses ? (slept / 3600e3).toFixed(1) + ' h' : '--'));
      plist.appendChild(prow('#5ee08f', t('owl.activity'), activeMin != null ? activeMin + ' ' + t('owl.min') : '--'));
      plist.appendChild(h('div.owd-prow', null, h('i', { style: { background: '#34c759' } }), h('span', null, t('owl.vitals_mon')), h('b', { html: live ? UI.icon('check', 16) : '--' })));
    });
    return { el: el };
  }

  /** owletCam(ctx, cfg, ids) -> the baby's camera: the one chosen in Settings, else the camera in the sock's own area (Home Assistant's
   *  areas: the sock's device and the camera both in the Bedroom), else null. */
  function owletCam(ctx, cfg, ids) {
    var set = ((ctx.settings.get().cameras || {}).owlet || {}).entity || cfg.entity; if (set) return set;
    var hs = ctx.hass() || {}, E = hs.entities || {}, Dv = hs.devices || {};
    var area = function (id) { var e = E[id]; if (!e) return null; return e.area_id || (e.device_id && Dv[e.device_id] && Dv[e.device_id].area_id) || null; };
    var a = ids && area(ids.heartRate); if (!a) return null;
    var cams = Object.keys(hs.states || {}).filter(function (k) { return k.indexOf('camera.') === 0 && area(k) === a; });
    return cams.filter(function (k) { return /owlet|baby|nursery|crib/.test(k); })[0] || cams[0] || null;
  }
  /** vitalsFor(ctx, camId) -> { hr, o2, temp, tempUnit, live, level } for the baby's camera (the Owlet cam: chosen in Settings or in the sock's
   *  area), else null. The full-screen camera shows them (okie-cameras.js). */
  function vitalsFor(ctx, camId) {
    var cfg = sockOnlyConfig(ctx); if (!cfg) return null;
    var ids = sockIds(cfg); if (!ids || owletCam(ctx, cfg, ids) !== camId) return null;
    var live = sockLive(ctx, ids), t = num(ctx, ids.skinTemp);
    return { hr: live ? num(ctx, ids.heartRate) : null, o2: live ? num(ctx, ids.o2) : null, temp: live ? t : null, tempUnit: unitOf(ctx, ids.skinTemp) || '°', live: !!live, level: statusFor(ctx, cfg).level };
  }
  /** camScreen(ctx, camId, hk) -> { el, dispose } | null: the Owlet camera's full screen, the user's reference (2026-11-19): the picture
   *  edge to edge; top left back + Owlet + Live, top right mic / sound / full screen / settings, bottom centre fit / snapshot / record
   *  (these fade 3 s after a touch: class cow-fade); always there: the rail (live, clips, readings, sleep), the vitals cards on the right,
   *  the baby's name and sleep bottom left, the sock and the base station bottom right. hk = the camera's actions (okie-cameras.js). */
  var pendingTab = null;
  function openOwletTab(ctx, tab) { pendingTab = tab; ctx.openApp('owlet'); }
  function camScreen(ctx, camId, hk) {
    var cfg = sockOnlyConfig(ctx); if (!cfg) return null;
    var ids = sockIds(cfg); if (!ids || owletCam(ctx, cfg, ids) !== camId) return null;
    var t = T(ctx), lang = ctx.lang(), dead = false;
    // the nursery speaker: Home Assistant commands named after the camera (rest_command.<camera>_play / _lullaby / _stop / _volume / _say)
    var obj = camId.split('.')[1] || '';
    var svcOk = function (n) { var hs = ctx.hass() || {}; return !!(hs.services && hs.services.rest_command && hs.services.rest_command[obj + '_' + n]); };
    var callSvc = function (n, data) { return Promise.resolve(ctx.call('rest_command', obj + '_' + n, data || {})); };
    var toast = function (kind, msg) { if (hk.notify) hk.notify(msg); else if (ctx.toast) ctx.toast(kind, msg); };      // on the camera layer (the card's toasts sit behind it)
    function cbtn(icon, label, fn, cls) { return h('button.cow-b' + (cls || ''), { type: 'button', 'aria-label': label, title: label, html: UI.icon(icon, 22), onclick: function (e) { e.stopPropagation(); if (ctx.haptic) ctx.haptic(8); fn(e.currentTarget); } }); }
    var liveTxt = h('span', null, t('owl.cam_live')), live = h('span.cow-live', null, h('i'), liveTxt);
    var tl = h('div.cow-tl.cow-fade', null, cbtn('back', t('cam.exit_full'), function () { hk.back(); }), h('span.cow-logo', { html: UI.icon('owl', 30) }), h('b.cow-brand', null, 'Owlet'), h('i.cow-sep'), live);
    var snd = cbtn('volume-off', t('cam.sound_on'), function (b) { var on = hk.sound(); b.innerHTML = UI.icon(on ? 'volume' : 'volume-off', 22); b.classList.toggle('on', !!on); });
    var mic = talkButton();
    var tr = h('div.cow-tr.cow-fade', null, cbtn('music', t('owl.lp_title'), function () { toggleLp(); }, '.cow-pc.k-music'), mic, snd, cbtn('scan', t('cam.full'), function () { hk.fullscreen(); }), cbtn('gear', t('card.settings'), function () { hk.close(); openOwletTab(ctx, 'settings'); }));
    var railLive = cbtn('camera', t('owl.cam_live'), function () { if (lpOpen) toggleLp(); }, '.on'), railMusic = cbtn('music', t('owl.lp_title'), function () { toggleLp(); });
    var rail = h('div.cow-rail', null, railLive, cbtn('image', t('owl.cam_clips'), function () { hk.clips(); }), railMusic,
      cbtn('pulse', t('owl.live_readings'), function () { hk.close(); openOwletTab(ctx, 'live'); }), cbtn('moon', t('owl.sleep'), function () { hk.close(); openOwletTab(ctx, 'sleep'); }));
    function card(icon, color) { var val = h('b'), unit = h('small'), extra = h('div.cow-ex'); var el = h('div.cow-card', null, h('span.cow-ic', { style: { color: color }, html: UI.icon(icon, 34) }), h('div.cow-cv', null, h('div.cow-num', null, val, unit), extra)); return { el: el, val: val, unit: unit, extra: extra }; }
    var cHr = card('heart', '#4fe39a'), cO2 = card('lungs', '#4fd6e8'), cT = card('thermo', '#fff'), cSg = card('signal', '#fff');
    tapOpen(cHr.el, ctx, ids.heartRate); tapOpen(cO2.el, ctx, ids.o2); tapOpen(cT.el, ctx, ids.skinTemp); tapOpen(cSg.el, ctx, ids.signal);
    [cHr, cO2, cT, cSg].forEach(function (c) { c.el.addEventListener('click', function () { hk.close(); }); });
    var tBar = h('div.cow-bar', null, h('i'), h('b')); cT.extra.appendChild(tBar);
    var vit = h('div.cow-vit', null, cHr.el, cO2.el, cT.el, cSg.el);
    var nameEl = h('div.cow-nm'), stEl = h('div.cow-st', null, h('i'), h('span'));
    var who = h('div.cow-who', null, nameEl, stEl);
    // sideways: fit, snapshot, record; upright phone (9:16 reference): clips, a big record, snapshot
    var pill = h('div.cow-pill.cow-fade', null, cbtn('scan', t('owl.cam_fit'), function () { hk.fit(); }, '.cow-lo.k-fit'), cbtn('image', t('owl.cam_clips'), function () { hk.clips(); }, '.cow-pc.k-clips'),
      cbtn('photo', t('owl.cam_snap'), function () { hk.snapshot(); }, '.k-snap'), cbtn('camera', t('owl.cam_rec'), function (b) { hk.record(b); }, '.k-rec'));
    var battEl = h('span.cow-batt'), netTxt = h('span');
    var stat = h('div.cow-stat', null, h('span.cow-sock', { html: bootieArt() }), h('div.cow-sk', null, h('span', null, t('owl.cam_sock')), battEl), h('i.cow-sep'), h('span.cow-net', null, h('span', { html: UI.icon('wifi', 22) }), netTxt));
    var lp = lullabyPanel(), talkPill = h('div.cow-talk', { hidden: true });
    var el = h('div.cow', null, h('div.cow-scrim'), tl, tr, rail, vit, lp.el, talkPill, h('div.cow-bar2'), who, pill, stat);
    var lpOpen = false;
    function toggleLp() { lpOpen = !lpOpen; el.classList.toggle('lp-open', lpOpen); lp.el.hidden = !lpOpen; railLive.classList.toggle('on', !lpOpen); railMusic.classList.toggle('on', lpOpen); if (lpOpen) lp.refresh(true); }

    // ---- Lullabies: the camera's own sounds and your songs (Home Assistant Media "owlet-sounds"), loop, sleep timer, speaker volume
    function lullabyPanel() {
      var sig = '', lastOwlet = [], renaming = false, tab = ctx.store.get('owl.lp_tab', 'owlet'), loop = ctx.store.get('owl.lp_loop', true) !== false, timer = +ctx.store.get('owl.lp_timer', 30) || 0, localPlay = null;
      var rows = h('div.cow-lprows'), note = h('div.cow-lpnote', { hidden: true });
      var segO = h('button', { type: 'button', onclick: function () { setTab('owlet'); } }, t('owl.lp_owlet')), segM = h('button', { type: 'button', onclick: function () { setTab('mine'); } }, t('owl.lp_mine'));
      var file = h('input', { type: 'file', accept: 'audio/*', hidden: true, onchange: function () { var f = file.files && file.files[0]; file.value = ''; if (f) addSong(f); } });
      var addBtn = h('button.cow-lpadd', { type: 'button', onclick: function () { file.click(); } }, h('span', { html: UI.icon('plus', 18) }), h('span', null, t('owl.lp_add')));
      var loopBtn = h('button.cow-chip', { type: 'button', onclick: function () { loop = !loop; ctx.store.set('owl.lp_loop', loop); paintCtl(); } }, h('span', { html: UI.icon('repeat', 16) }), h('span', null, t('owl.lp_loop')));
      var chips = [15, 30, 60, 0].map(function (m) { var b = h('button.cow-chip', { type: 'button', onclick: function () { timer = m; ctx.store.set('owl.lp_timer', m); paintCtl(); } }, m === 0 ? '∞' : m < 60 ? m + ' m' : (m / 60) + ' h'); b._m = m; return b; });
      var stopBtn = h('button.cow-chip.stop', { type: 'button', 'aria-label': t('owl.lp_stop'), onclick: function () { if (ctx.haptic) ctx.haptic(10); localPlay = { kind: 'none', name: '', at: Date.now() }; paintRows(); callSvc('stop').then(function () { toast('info', t('owl.lp_stopped')); refreshSoon(); }, function () { toast('warn', t('owl.lp_fail')); }); } }, h('span', { html: UI.icon('pausefill', 14) }), h('span', null, t('owl.lp_stop')));
      // rename: the camera only reports an id and a length, so you name the sounds after hearing them (saved in the settings, every screen)
      var renameBtn = h('button.cow-lpx.cow-lpren', { type: 'button', 'aria-label': t('owl.lp_rename'), title: t('owl.lp_rename'), html: UI.icon('pencil', 18), onclick: function () { renaming = !renaming; renameBtn.classList.toggle('on', renaming); sig = ''; paintRows(); } });
      var names = function () { return (owSet(ctx).soundNames) || {}; };
      var volIn = h('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': t('owl.lp_volume') }), volT = 0, volTouched = 0;
      volIn.addEventListener('input', function () { volTouched = Date.now(); clearTimeout(volT); volT = setTimeout(function () { callSvc('volume', { percent: +volIn.value }); }, 350); });
      var box = h('div.cow-lp', { hidden: true }, h('div.cow-lph', null, h('b', null, t('owl.lp_title')), renameBtn, h('button.cow-lpx', { type: 'button', 'aria-label': t('cam.exit_full'), html: UI.icon('close', 20), onclick: function () { toggleLp(); } })),
        h('div.cow-seg', null, segO, segM), note, rows, h('div.cow-lpadd-w', null, addBtn, file),
        h('div.cow-lpctl', null, loopBtn, h('div.cow-lptim', null, chips), stopBtn),
        h('div.cow-lpvol', null, h('span', { html: UI.icon('volume', 18) }), volIn, h('span', null, t('owl.lp_camera'))));
      function state() { var hs = ctx.hass() || {}, st = hs.states || {}; for (var k in st) { if (k.indexOf('sensor.') === 0) { var a = st[k].attributes || {}; if (Array.isArray(a.owlet) && Array.isArray(a.mine)) return { id: k, a: a }; } } return null; }
      function refreshSoon() { var S = state(); if (S) setTimeout(function () { ctx.call('homeassistant', 'update_entity', { entity_id: S.id }); }, 600); }
      function setTab(x) { tab = x; ctx.store.set('owl.lp_tab', x); paintRows(); }
      function pretty(n) { return String(n).replace(/\.[a-z0-9]+$/i, '').replace(/-\d{12,}$/, '').replace(/[-_]+/g, ' ').replace(/^\w/, function (c) { return c.toUpperCase(); }); }
      function dur(ms) { if (!ms) return ''; var sec = Math.round(ms / 1000); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
      function playing(S) {
        var p = S && S.a.playing, srv = p && p.kind ? { kind: p.kind, name: p.name } : null;
        // what was just tapped wins until the server says the same (waking an idle camera takes up to ~20 s), at most 45 s
        if (localPlay && Date.now() - localPlay.at < 45000) {
          var same = localPlay.kind === 'none' ? !srv : (srv && srv.name === localPlay.name);
          if (!same) return localPlay.kind === 'none' ? null : localPlay;
          localPlay = null;
        }
        return srv; }
      function paintCtl() { loopBtn.classList.toggle('on', loop); chips.forEach(function (b) { b.classList.toggle('on', b._m === timer); }); }
      function paintRows() {
        segO.classList.toggle('on', tab === 'owlet'); segM.classList.toggle('on', tab === 'mine');
        var S = state(), ready = svcOk('play') && svcOk('lullaby');
        note.hidden = ready && !!S; note.textContent = t('owl.lp_setup');
        if (!S) { rows.innerHTML = ''; sig = ''; return; }
        if (S.a.owlet && S.a.owlet.length) lastOwlet = S.a.owlet;      // the camera sometimes answers with an empty list: keep the last good one
        var owl = (S.a.owlet && S.a.owlet.length) ? S.a.owlet : lastOwlet;
        var nm = names(), now = playing(S), nS = 0, nL = 0;      // the camera has no names: endless ones are soothing sounds, timed ones lullabies (Owlet's two kinds)
        var list = tab === 'owlet' ? owl.map(function (it) { var def = it.ms ? t('owl.lp_lullaby', { n: ++nL }) : t('owl.lp_soothing', { n: ++nS }); return { key: it.uuid, name: nm[it.uuid] || def, sub: dur(it.ms) || t('owl.lp_endless'), kind: 'owlet' }; })
          : S.a.mine.map(function (f) { return { key: f, name: nm[f] || pretty(f), sub: '', kind: 'song' }; });
        if (S.a.volume != null && Date.now() - volTouched > 3000) volIn.value = String(S.a.volume);
        // rebuild the rows only when something changed: a rebuild every few seconds reset the scroll and swallowed taps (Stop)
        var nsig = tab + '|' + renaming + '|' + list.map(function (x) { return x.key + '=' + x.name; }).join(',') + '|' + (now ? now.kind + ':' + now.name : '');
        if (nsig === sig) return; sig = nsig;
        var keepTop = rows.scrollTop; rows.innerHTML = '';
        if (!list.length) rows.appendChild(h('div.cow-lpempty', null, tab === 'mine' ? t('owl.lp_none') : t('owl.lp_none_cam')));
        list.forEach(function (it) {
          if (renaming) {      // a field per sound; Enter or leaving the field saves it
            var inp = h('input.cow-lpin', { type: 'text', value: it.name, maxlength: '40', 'aria-label': t('owl.lp_rename') });
            var save = function () { var v = inp.value.trim(), m = {}; m[it.key] = v; ctx.settings.set({ owlet: { soundNames: m } }); };
            inp.addEventListener('change', save); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
            rows.appendChild(h('div.cow-lpr.ren', null, h('i', { html: UI.icon('music', 18) }), h('span', null, inp, it.sub ? h('small', null, it.sub) : null)));
            return;
          }
          var on = now && now.kind === it.kind && now.name === it.key;
          rows.appendChild(h('button.cow-lpr' + (on ? '.on' : ''), { type: 'button', onclick: function () {
            if (ctx.haptic) ctx.haptic(8);
            if (on) { localPlay = { kind: 'none', name: '', at: Date.now() }; callSvc('stop').then(refreshSoon); paintRows(); return; }
            localPlay = { kind: it.kind, name: it.key, at: Date.now() }; paintRows();
            var pr = it.kind === 'owlet' ? callSvc('lullaby', { uuid: it.key, repeat: loop, timeout_ms: timer ? timer * 60000 : 0 }) : callSvc('play', { file: it.key, loop: loop, timer_min: timer });
            pr.then(refreshSoon, function () { localPlay = { kind: 'none', name: '', at: Date.now() }; paintRows(); toast('warn', t('owl.lp_fail')); });
          } }, h('i', { html: UI.icon('music', 18) }), h('span', null, h('b', null, it.name), it.sub ? h('small', null, it.sub) : null), h('em', { html: UI.icon(on ? 'pausefill' : 'playfill', 20) })));
        });
        rows.scrollTop = keepTop;
      }
      function addSong(f) {
        if (!UI.mediaUpload) return;
        toast('info', t('owl.lp_uploading'));
        UI.mediaUpload(ctx, f, 'owlet-sounds', String(f.name || 'song').replace(/\.[a-z0-9]+$/i, '')).then(function () { toast('success', t('owl.lp_added')); tab = 'mine'; ctx.store.set('owl.lp_tab', 'mine'); refreshSoon(); setTimeout(paintRows, 1500); },
          function (e) { toast('warn', e === 'size' ? t('owl.lp_big') : e === 'type' ? t('owl.lp_type') : t('owl.lp_fail')); });
      }
      paintCtl();
      return { el: box, refresh: function (now) { if (now) refreshSoon(); paintRows(); } };
    }

    // ---- hold to talk: record while the mic is held, then the camera plays it (like a walkie-talkie)
    function talkButton() {
      var b = h('button.cow-b.cow-mic', { type: 'button', 'aria-label': t('owl.cam_mic'), title: t('owl.cam_mic'), html: UI.icon('mic', 22) });
      var held = false, rec = null, stream = null, chunks = [], t0 = 0;
      function pill(txt) { if (!talkPill) return; talkPill.hidden = !txt; talkPill.innerHTML = txt ? UI.icon('mic', 18) + '<span>' + txt + '</span>' : ''; }
      function start() {
        if (!svcOk('say')) { toast('info', t('owl.cam_mic_off')); return; }
        var md = navigator.mediaDevices; if (!md || !md.getUserMedia || !g.MediaRecorder) { toast('warn', t('owl.talk_nomic')); return; }
        md.getUserMedia({ audio: true }).then(function (s2) {
          stream = s2; if (!held) { stopTracks(); return; }      // let go before the mic opened
          chunks = []; rec = new g.MediaRecorder(s2); rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); }; rec.onstop = send;
          rec.start(); t0 = Date.now(); b.classList.add('talking'); pill(t('owl.talking'));
        }, function () { toast('warn', t('owl.talk_blocked')); });
      }
      function stopTracks() { if (stream) { stream.getTracks().forEach(function (x) { x.stop(); }); stream = null; } }
      function end() { held = false; if (rec && rec.state === 'recording') rec.stop(); b.classList.remove('talking'); }
      function send() {
        var r = rec; rec = null; stopTracks();
        if (Date.now() - t0 < 600 || !chunks.length) { pill(''); toast('info', t('owl.talk_short')); return; }
        var type = (r && r.mimeType || chunks[0].type || 'audio/webm').split(';')[0], ext = /mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
        var f; try { f = new File([new Blob(chunks, { type: type })], 'talk.' + ext, { type: type }); } catch (e) { pill(''); return; }
        pill(t('owl.talk_sending'));
        UI.mediaUpload(ctx, f, 'owlet-talk', 'talk').then(function (res) { return callSvc('say', { file: String(res.id || '').split('/').pop() }); })
          .then(function () { pill(''); toast('success', t('owl.talk_sent')); }, function () { pill(''); toast('warn', t('owl.talk_fail')); });
      }
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); if (held) return; held = true; if (ctx.haptic) ctx.haptic(12); start(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, function () { if (held) end(); }); });
      b.addEventListener('click', function (e) { e.stopPropagation(); });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      return b;
    }
    var f1 = function (n) { return n == null ? '--' : String(Math.round(n)); }, f2 = function (n) { return n == null ? '--' : (Math.round(n * 10) / 10).toFixed(1); };
    function paint() {
      if (dead) return;
      var s = statusFor(ctx, cfg), lv = sockLive(ctx, ids), on = s.level !== 'off';
      live.dataset.on = on ? '1' : ''; liveTxt.textContent = on ? t('owl.cam_live') : t('owl.tag_off');
      cHr.val.textContent = lv ? f1(num(ctx, ids.heartRate)) : '--'; cHr.unit.textContent = 'bpm';
      cO2.val.textContent = lv ? f1(num(ctx, ids.o2)) : '--'; cO2.unit.innerHTML = '% SpO<sub>2</sub>';
      var tv = lv ? num(ctx, ids.skinTemp) : null, tu = unitOf(ctx, ids.skinTemp) || '°F', lo = /C/.test(tu) ? 35 : 95, hi = /C/.test(tu) ? 38 : 100.4;
      cT.val.textContent = f2(tv); cT.unit.textContent = tu; tBar.style.setProperty('--p', (tv == null ? 0 : Math.max(0, Math.min(1, (tv - lo) / (hi - lo)))) * 100 + '%');
      var sg = num(ctx, ids.signal); cSg.val.textContent = f1(sg); cSg.unit.textContent = 'dBm';
      nameEl.textContent = (owSet(ctx).babyName || '').trim() || 'Owlet';
      battInto(battEl, ctx, ids, t); netTxt.textContent = on ? t('owl.cam_online') : t('owl.cam_offline'); stat.dataset.on = on ? '1' : '';
    }
    function waves() {
      sockHist(ctx, ids, 24).then(function (H) {
        if (dead) return; var now = Date.now(), last = function (a) { return (a || []).filter(function (p) { return p[0] > now - 2 * 3600e3; }); };
        [[cHr, H.hr, '#4fe39a', 'cowhr'], [cO2, H.o2, '#4fd6e8', 'cowo2'], [cSg, H.sig, '#4fd6e8', 'cowsg']].forEach(function (x) { var w = x[0].extra.querySelector('.cow-wave') || x[0].extra.appendChild(h('div.cow-wave')); w.innerHTML = waveSvg(last(x[1]), x[2], x[3]); });
        cSg.extra.querySelector('.cow-wave').classList.add('dash');
        var ses = sleepSession(H.ss, now), ss = ctx.state(ids.sleepState), stt = ss && ss.state, asleep = stt === 'light_sleep' || stt === 'deep_sleep';
        var sp = stEl.querySelector('span'); stEl.dataset.on = asleep ? '1' : '';
        if (!sockLive(ctx, ids)) sp.textContent = statusFor(ctx, cfg).label;
        else if (asleep && ses) { var d = fmtDur(now - ses.start); sp.textContent = t('owl.cam_sleeping') + ' • ' + d.h + 'h ' + d.m + 'm'; }
        else sp.textContent = sleepLabel(t, stt);
      });
    }
    paint(); waves(); var pT = setInterval(paint, 2000), wT = setInterval(waves, 60000);
    var lpT = setInterval(function () { if (lpOpen) lp.refresh(false); }, 3000);
    return { el: el, dispose: function () { dead = true; clearInterval(pT); clearInterval(wT); clearInterval(lpT); } };
  }
  /** tapOpen(el, ctx, id) -> el: a vital's card opens that sensor's own screen on its History chart (the user's request, 2026-11-19). */
  function tapOpen(el, ctx, id) {
    if (!id || !ctx.state(id) || !ctx.openDetail) return el;
    el.classList.add('ow-tap'); el.setAttribute('role', 'button'); el.tabIndex = 0;
    var go = function () { if (ctx.haptic) ctx.haptic(8); ctx.openDetail(id, el, 'history'); };
    el.addEventListener('click', go); el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return el;
  }
  /** Little bars of the last readings (signal, movement), newest on the right. */
  function miniBars(el, pts, n, lo, hi) {
    el.innerHTML = ''; if (!pts || !pts.length) return;
    var last = pts.slice(-n);
    last.forEach(function (p) { el.appendChild(h('i', { style: { height: Math.max(12, Math.min(100, (p[1] - lo) / Math.max(1, hi - lo) * 100)) + '%' } })); });
  }
  /** pageLive(ctx, cfg, ids) -> { el }: the Live tab, the user's "Live Monitoring" reference (2026-11-19): title, a sock card with the
   *  connection and battery, big Heart Rate and Oxygen cards, Skin Temp / Signal / Movement, and a strip with the session and the stage now.
   *  Breathing rate is not measured by the sock, so its place shows the sock's Signal (a real reading), as the user approved. */
  function pageLive(ctx, cfg, ids, go) {
    var t = T(ctx), now = Date.now(), s = statusFor(ctx, cfg), live = sockLive(ctx, ids);
    var battEl = h('span.owl-sbatt');
    var sockCard = h('button.ow-page.owl-sock', { type: 'button', onclick: function () { if (ctx.haptic) ctx.haptic(8); if (go) go('settings'); } },      // the sock's own settings
      h('div.owl-sart', { html: bootieArt() }), h('div.owl-stxt', null, h('div.owl-st1', null, s.level === 'off' ? t('owl.tag_off') : t('owl.sock_conn')), battEl), h('span.owl-chev', { html: UI.icon('chevron', 18) }));
    battInto(battEl, ctx, ids, t);
    var head = h('div.owh.owl-head', null,
      h('div.owl-left', null,
        h('div.owh-brand', null, h('span.owh-ic', { html: UI.icon('heart', 18) }), h('span.owh-brand-t', null, 'Owlet')),
        h('div.owl-title', null, t('owl.live_mon')),
        h('div.owh-status.owl-status', null, h('span.owh-dot'), h('span', null, live ? t('owl.realtime') : s.label))),
      sockCard);
    head.dataset.level = s.level;
    function big(icon, val, unit, label, cls) {
      var wave = h('div.owl-wave');
      return { el: h('div.ow-page.owl-big.' + cls, null, h('div.owl-btop', null, h('span.owl-bic', { html: UI.icon(icon, 80) }), h('div', null, h('div.owl-bnum', null, h('b', null, val), h('span', null, unit)), h('div.owl-blab', null, label))), wave), wave: wave };
    }
    var hrV = num(ctx, ids.heartRate), o2V = num(ctx, ids.o2), stV = num(ctx, ids.skinTemp), sgV = num(ctx, ids.signal);
    var hr = big('heart', live && hrV != null ? Math.round(hrV) : '--', 'bpm', t('owl.hr'), 'owd-hr');
    var o2 = big('lungs', live && o2V != null ? Math.round(o2V) : '--', '%', t('owl.o2_long'), 'owd-o2');
    function small(icon, label, valEl, foot) { return h('div.ow-page.owl-small', null, h('div.owl-stop', null, h('span.owl-sic', { html: UI.icon(icon, 42) }), h('div', null, h('div.owl-sl', null, label), valEl)), foot); }
    var stWave = h('div.owl-swave'), sgBars = h('div.owl-sbars'), mvBars = h('div.owl-sbars');
    var stVal = h('div.owl-sv', null, live && stV != null ? (Math.round(stV * 10) / 10) + (unitOf(ctx, ids.skinTemp) || '°') : '--');
    var sgVal = h('div.owl-sv', null, sgV != null ? Math.round(sgV) + '' : '--', h('span', null, ' dBm'));
    var mvId = moveId(ctx), mvV = mvId ? num(ctx, mvId) : null, mvVal = h('div.owl-sv.owl-mv', null, mvId ? (mvV != null ? (mvV > 0 ? t('owl.mv_on') : t('owl.mv_still')) : '--') : t('owl.sensor_off'));
    tapOpen(hr.el, ctx, ids.heartRate); tapOpen(o2.el, ctx, ids.o2);
    var row3 = h('div.owl-row3', null, tapOpen(small('thermo', t('owl.skin_temp'), stVal, stWave), ctx, ids.skinTemp), tapOpen(small('wifi', t('owl.signal'), sgVal, sgBars), ctx, ids.signal), tapOpen(small('steps', t('owl.movement'), mvVal, mvBars), ctx, mvId));
    var sessEl = h('b', null, '--'), stageEl = h('b', null, '--'), stBar = h('div.owd-stages.owl-stbar');
    var ss = ctx.state(ids.sleepState), stageNow = ss && ss.state;
    stageEl.textContent = live && stageNow ? (stageNow === 'deep_sleep' ? t('owl.st_deep') : stageNow === 'light_sleep' ? t('owl.st_light') : stageNow === 'awake' ? t('owl.st_awake') : sleepLabel(t, stageNow)) : '--';
    var strip = h('div.ow-page.owl-strip', null,
      h('div.owl-livetag', null, h('span', { html: UI.icon('signal', 28) }), h('span', null, live ? t('owl.live') : t('owl.tag_idle'))),
      h('div.owl-sep'), h('div.owl-si', null, h('span', { html: UI.icon('bed', 32) }), h('div', null, h('span', null, t('owl.session')), sessEl)),
      h('div.owl-sep'), h('div.owl-si', null, h('span', { html: UI.icon('moon', 30) }), h('div', null, h('span', null, t('owl.stage')), stageEl)),
      h('div.owl-sep'), stBar);
    var el = h('div.owd.owl', null, head, h('div.owd-row2', null, hr.el, o2.el), row3, strip);
    sockHist(ctx, ids, 24).then(function (H) {
      var last2 = function (a) { return (a || []).filter(function (p) { return p[0] > now - 2 * 3600e3; }); };
      hr.wave.innerHTML = waveSvg(last2(H.hr), '#5ee08f', 'owlg-hr'); o2.wave.innerHTML = waveSvg(last2(H.o2), '#4fd6e8', 'owlg-o2');
      stWave.innerHTML = waveSvg(last2(H.st), '#5ee08f', 'owlg-st');
      miniBars(sgBars, H.sig, 14, -95, -35);
      if (H.mv) miniBars(mvBars, H.mv, 14, 0, Math.max.apply(null, H.mv.map(function (p) { return p[1]; }).concat([1])));
      var ses = sleepSession(H.ss, now);
      if (ses) {
        var d = fmtDur(ses.end - ses.start); sessEl.textContent = d.h + ' h ' + d.m + ' m';
        var tot = Math.max(1, ses.deep + ses.light + ses.awake); stBar.innerHTML = '';
        [['var(--owd-deep)', ses.deep], ['var(--owd-light)', ses.light], ['var(--owd-awake)', ses.awake]].forEach(function (p) { stBar.appendChild(h('i', { style: { width: (p[1] / tot * 100) + '%', background: p[0] } })); });
      }
    });
    return { el: el };
  }

  /** The night before the given time: the latest sleep that ended before `before` (for "vs. last night"). */
  function prevSession(ss, before) {
    var rows = ss.filter(function (r) { return r[0] < before - 30 * 60000; }), endT = before;
    while (rows.length && !SLEEPY[rows[rows.length - 1][1]]) { endT = rows[rows.length - 1][0]; rows.pop(); }
    return rows.length ? sleepSession(rows, endT) : null;
  }
  /** Our own Sleep Score (0-100) from real numbers only: time asleep against the goal (50), share of deep sleep (25),
   *  few wakings (15) and the oxygen average (10). The info button on the page explains it. */
  function sleepScore(ses, goalH, o2avg) {
    if (!ses) return null;
    var slept = ses.deep + ses.light, dur = Math.min(1, slept / (goalH * 3600e3)) * 50;
    var deep = Math.min(1, (ses.deep / Math.max(1, slept)) / 0.4) * 25, wake = Math.max(0, 15 - ses.wakings * 4);
    var ox = o2avg == null ? 10 : o2avg >= 95 ? 10 : Math.max(0, (o2avg - 88) / 7 * 10);
    return Math.round(dur + deep + wake + ox);
  }
  /** Sleep cycles: each stretch of deep sleep (deep parts closer than 5 minutes count as one). */
  function cyclesOf(ses) {
    var n = 0, lastEnd = -Infinity;
    ses.segs.forEach(function (x) { if (x[2] === 'deep_sleep') { if (x[0] - lastEnd > 5 * 60000) n++; lastEnd = x[1]; } });
    return n;
  }
  /** The night as lanes (Awake / Light / Deep), the user's "Cycle Timeline" reference: glowing blocks joined by thin steps. */
  function hypnoSvg(ses, lang) {
    var W = 600, H = 96, lane = { awake: 14, light_sleep: 48, deep_sleep: 82 }, col = { awake: '#e8d5b0', light_sleep: '#9a7bff', deep_sleep: '#6a4be0' };
    var t0 = ses.start, t1 = Math.max(ses.end, t0 + 1), x = function (t) { return (t - t0) / (t1 - t0) * W; };
    var blocks = '', steps = '', prev = null;
    ses.segs.forEach(function (sg) {
      var st = lane[sg[2]] != null ? sg[2] : 'awake', y = lane[st], x0 = x(sg[0]), x1 = Math.max(x0 + 3, x(sg[1]));
      if (prev) steps += '<path d="M' + x0.toFixed(1) + ' ' + prev + 'V' + y + '" stroke="rgba(255,255,255,.28)" stroke-width="1.5"/>';
      blocks += '<rect x="' + x0.toFixed(1) + '" y="' + (y - 8) + '" width="' + (x1 - x0).toFixed(1) + '" height="16" rx="4" fill="' + col[st] + '"/>';
      prev = y;
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><defs><filter id="owshg" x="-5%" y="-60%" width="110%" height="220%"><feGaussianBlur stdDeviation="5"/></filter></defs>' +
      steps + '<g filter="url(#owshg)" opacity=".7">' + blocks + '</g>' + blocks + '</svg>';
  }
  /** A small round gauge (Night vitals): a glowing arc for `pc` percent, an icon and the value inside. */
  function miniGauge(pc, color, icon, val, label) {
    var a = pc == null ? 0 : Math.max(0, Math.min(100, pc));
    return h('div.ows-g', null,
      h('div.ows-gr', { html: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="7"/>' + (a > 0 ? '<circle cx="50" cy="50" r="42" fill="none" stroke="' + color + '" stroke-width="9" stroke-linecap="round" pathLength="100" stroke-dasharray="' + a + ' ' + (100 - a) + '" transform="rotate(-90 50 50)" opacity=".6" style="filter:blur(3px)"/><circle cx="50" cy="50" r="42" fill="none" stroke="' + color + '" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="' + a + ' ' + (100 - a) + '" transform="rotate(-90 50 50)"/>' : '') + '</svg>' },
        h('span.ows-gi', { style: { color: color }, html: UI.icon(icon, 17) }), h('b', null, val)),
      h('span.ows-gl', null, label));
  }
  /** One line about the night, from the AI already set up in Home Assistant (the same agent the Assistant app uses),
   *  asked once per night and stage of the night, never with made-up numbers: only the real ones go in. Until it answers,
   *  or without an AI, a plain line worked out from the same numbers shows. */
  var insightC = {};
  function insightFor(ctx, facts, key, fallback, cb) {
    cb(insightC[key] || fallback);
    if (insightC[key]) return;
    var hs = ctx.hass(), sys = g.OkieMotor.system, agent = sys && sys.pickAgent ? sys.pickAgent(hs && hs.states, (ctx.settings.get().assistant || {}).agent) : '';
    if (!agent || agent === 'conversation.home_assistant' || insightC[key + '?']) return;
    insightC[key + '?'] = 1;
    var q = 'Write ONE short, warm sentence (at most 14 words) for a parent about their baby\'s sleep last night, in language "' + ctx.lang() + '". No medical advice, no numbers that are not given, do not control any device. Facts from the Owlet sock: ' + facts;
    Promise.resolve(ctx.callWS({ type: 'conversation/process', text: q, language: ctx.lang(), agent_id: agent })).then(function (r) {
      var rt = r && r.response && r.response.response_type; if (rt && rt !== 'query_answer') return;      // an action or an error is not an insight
      var txt = sys.speechOf ? sys.speechOf(r) : (r && r.response && r.response.speech && r.response.speech.plain && r.response.speech.plain.speech);
      txt = String(txt || '').trim().replace(/^["']|["']$/g, '');
      if (txt && txt.length < 220) { insightC[key] = txt; cb(txt); }
    }).catch(function () {});
  }
  /** pageSleep(ctx, cfg, ids) -> { el }: the Sleep tab, the user's Sleep reference (2026-11-19). Everything comes from the sock's
   *  sleep state, heart rate, oxygen and (when the user turns it on) movement history. The sock has no REM, HRV or recovery reading,
   *  so as approved: stages are Deep / Light / Awake, and "Recovery" became the night's vitals (steady heart, oxygen, restlessness). */
  function pageSleep(ctx, cfg, ids) {
    var t = T(ctx), now = Date.now(), lang = ctx.lang(), goalH = +((ctx.settings.get().owlet || {}).sleepGoalH) || 10;
    var tm = function (ms) { return new Date(ms).toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }); };
    var totNum = h('div.ows-tot', null, '--'), totSub = h('div.ows-totsub', null, '');
    var scoreV = h('b', null, '--'), scoreW = h('div.ows-scw', { html: '<svg viewBox="0 0 100 100"><defs><linearGradient id="owsscg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b49cff"/><stop offset="1" stop-color="#6a4be0"/></linearGradient></defs><circle cx="50" cy="50" r="43" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="7"/><circle class="a" cx="50" cy="50" r="43" fill="none" stroke="url(#owsscg)" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 50 50)" opacity=".7" style="filter:blur(4px)"/><circle class="a" cx="50" cy="50" r="43" fill="none" stroke="url(#owsscg)" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100" transform="rotate(-90 50 50)"/></svg>' });
    var scoreIn = h('div.ows-scin', null, scoreV, h('span', null, t('owl.score')));
    var gradeEl = h('div.ows-grade', null, '--'), deltaEl = h('div.ows-delta');
    var info = h('div.ows-info', { hidden: true }, t('owl.score_info', { g: goalH }));
    var infoBtn = h('button.ows-ib', { type: 'button', 'aria-label': t('owl.score_about'), html: UI.icon('info', 22), onclick: function () { if (ctx.haptic) ctx.haptic(6); info.hidden = !info.hidden; } });
    var scoreCard = h('div.ow-page.ows-score', null, h('div.ows-scring', null, scoreW, scoreIn), h('div.ows-scr', null, gradeEl, deltaEl), infoBtn, info);
    var totCard = h('div.ow-page.ows-total', null, totNum, totSub);
    var stBar = h('div.owd-stages.ows-bar'), stLeg = h('div.owd-legend.ows-leg');
    var stagesCard = h('div.ow-page.ows-stages', null, h('div.ows-ch', null, h('span', { html: UI.icon('bed', 26) }), t('owl.stages')), stBar, stLeg);
    var cycN = h('b.ows-bign', null, '--'), wakN = h('b.ows-bign', null, '--');
    var cycCard = h('div.ow-page.ows-count', null, h('div.ows-ch', null, h('span', { html: UI.icon('refresh', 24) }), t('owl.cycles')), cycN);
    var wakCard = h('div.ow-page.ows-count', null, h('div.ows-ch', null, h('span', { html: UI.icon('eye', 24) }), t('owl.wakes')), wakN);
    var tl = h('div.ows-tl'), tlAxis = h('div.ows-axis');
    var tlCard = h('div.ow-page.ows-tlc', null, h('div.ows-ch', null, h('span', { html: UI.icon('chart', 24) }), t('owl.timeline')),
      h('div.ows-tlbody', null, h('div.ows-lanes', null, h('span', null, t('owl.st_awake')), h('span', null, t('owl.st_light')), h('span', null, t('owl.st_deep'))), tl), tlAxis);
    var gauges = h('div.ows-gs');
    var vitCard = h('div.ow-page.ows-vit', null, h('div.ows-ch', null, h('span.ows-gn', { html: UI.icon('heart', 24) }), t('owl.night_vitals')), gauges);
    var insTxt = h('span', null, '--');
    var insCard = h('div.ow-page.ows-ins', null, h('div.ows-ch', null, h('span', { html: UI.icon('spark', 24) }), t('owl.insights')), h('div.ows-insb', null, h('span.ows-insi', { html: UI.icon('pulse', 26) }), insTxt));
    var el = h('div.owd.ows', null,
      h('div.ows-head', null, h('span', { html: UI.icon('bed', 30) }), t('owl.sleep')),
      h('div.ows-r1', null, totCard, scoreCard),
      h('div.ows-r2', null, stagesCard, cycCard, wakCard),
      tlCard,
      h('div.ows-r4', null, vitCard, insCard));
    sockHist(ctx, ids, 48).then(function (Hs) {
      var ses = sleepSession(Hs.ss, now);
      if (!ses) { totSub.textContent = t('owl.no_sleep'); insTxt.textContent = t('owl.no_sleep'); gauges.appendChild(h('span.ows-none', null, '--')); return; }
      var slept = ses.deep + ses.light, d = fmtDur(slept), inS = function (a) { return (a || []).filter(function (p) { return p[0] >= ses.start && p[0] <= ses.end; }).map(function (p) { return p[1]; }); };
      totNum.innerHTML = '<b>' + d.h + '</b><span>h</span> <b>' + d.m + '</b><span>m</span>';
      totSub.textContent = t('owl.total_since', { t: tm(ses.start) });
      var o2s = inS(Hs.o2), o2avg = o2s.length ? o2s.reduce(function (a, b) { return a + b; }, 0) / o2s.length : null;
      var sc = sleepScore(ses, goalH, o2avg);
      scoreV.textContent = sc;
      Array.prototype.forEach.call(scoreW.querySelectorAll('circle.a'), function (c) { c.setAttribute('stroke-dasharray', sc + ' ' + (100 - sc)); });
      gradeEl.textContent = t(sc >= 85 ? 'owl.sc_exc' : sc >= 70 ? 'owl.sc_good' : sc >= 50 ? 'owl.sc_fair' : 'owl.sc_poor');
      var pv = prevSession(Hs.ss, ses.start), psc = pv ? sleepScore(pv, goalH, null) : null;
      if (psc != null) { var dl = sc - psc; deltaEl.innerHTML = ''; deltaEl.appendChild(h('span.ows-arr' + (dl < 0 ? '.dn' : ''), { html: ARROW })); deltaEl.appendChild(document.createTextNode(t('owl.vs_last', { d: (dl > 0 ? '+' : '') + dl }))); }
      else deltaEl.textContent = t('owl.first_night');
      var tot = Math.max(1, ses.deep + ses.light + ses.awake), parts = [['deep', ses.deep, 'var(--owd-deep)'], ['light', ses.light, 'var(--owd-light)'], ['awake', ses.awake, 'var(--owd-awake)']];
      parts.forEach(function (p) { var pc = Math.round(p[1] / tot * 100); stBar.appendChild(h('i', { style: { width: (p[1] / tot * 100) + '%', background: p[2] } })); stLeg.appendChild(h('span', null, h('i', { style: { background: p[2] } }), t('owl.st_' + p[0]) + ' ', h('b', null, pc + '%'))); });
      var cyc = cyclesOf(ses); cycN.textContent = cyc; wakN.textContent = ses.wakings;
      tl.innerHTML = hypnoSvg(ses, lang);
      var n = 5; for (var i = 0; i < n; i++) tlAxis.appendChild(h('span', null, tm(ses.start + (ses.end - ses.start) * i / (n - 1))));
      // night vitals: how steady the heart was (readings within 10 bpm of the night's middle value), the oxygen average, restlessness
      var hrs = inS(Hs.hr).sort(function (a, b) { return a - b; }), med = hrs.length ? hrs[Math.floor(hrs.length / 2)] : null;
      var steady = hrs.length ? Math.round(hrs.filter(function (v) { return Math.abs(v - med) <= 10; }).length / hrs.length * 100) : null;
      var mv = Hs.mv ? (function () { var on = 0; Hs.mv.forEach(function (p, i) { var nx = Hs.mv[i + 1] ? Hs.mv[i + 1][0] : now; var a = Math.max(p[0], ses.start), b = Math.min(nx, ses.end); if (b > a && p[1] > 0) on += b - a; }); return Math.round(on / Math.max(1, ses.end - ses.start) * 100); })() : null;
      gauges.appendChild(miniGauge(steady, '#5ee08f', 'heart', steady != null ? steady + '%' : '--', t('owl.hr_steady')));
      gauges.appendChild(miniGauge(o2avg, '#4fd6e8', 'lungs', o2avg != null ? Math.round(o2avg) + '%' : '--', t('owl.o2_avg')));
      gauges.appendChild(miniGauge(mv, '#9a7bff', 'steps', mv != null ? mv + '%' : t('owl.off'), t('owl.restless')));
      // the insight: real numbers in, one sentence out
      var deepPc = Math.round(ses.deep / tot * 100);
      var facts = 'slept ' + d.h + ' h ' + d.m + ' min since ' + tm(ses.start) + ' (goal ' + goalH + ' h); deep sleep ' + deepPc + '%; light ' + Math.round(ses.light / tot * 100) + '%; woke ' + ses.wakings + ' times; ' + cyc + ' sleep cycles' +
        (o2avg != null ? '; average oxygen ' + Math.round(o2avg) + '%' : '') + (med != null ? '; typical heart rate ' + Math.round(med) + ' bpm' : '') + (psc != null ? '; sleep score ' + sc + ' vs ' + psc + ' the night before' : '; sleep score ' + sc) + '.';
      var fb = t(deepPc >= 35 ? 'owl.ins_deep' : ses.wakings >= 3 ? 'owl.ins_wakes' : slept >= goalH * 3600e3 * 0.9 ? 'owl.ins_goal' : 'owl.ins_ok');
      insightFor(ctx, facts, ses.start + '|' + Math.floor(slept / 3600e3) + '|' + lang, fb, function (txt) { insTxt.textContent = txt; });
    });
    return { el: el };
  }

  // ------------------------------------------------ History: any day, week or month of the sock's readings ----
  var HX = g.OkieMotor.hist;      // the shared History look and data (okie-hist.js): the sensor screens use the same
  var ARROW = HX.ARROW, DAY = HX.DAY, dayStart = HX.dayStart, addDays = HX.addDays, statesIn = HX.statesIn, series = HX.series, summary = HX.summary, merge3h = HX.merge3h, lineChart = HX.lineChart, niceScale = HX.niceScale;
  var histView = { mode: 'day', day: null };      // the History tab's choice, kept across the 15 s redraws
  /** Sleep inside [a, b) from the sleep-state history: { deep, light, awake } in ms (awake only between sleeps). */
  function sleepIn(rows, a, b, now) {
    var o = { deep: 0, light: 0, awake: 0 };
    for (var i = 0; i < rows.length; i++) {
      var s0 = Math.max(a, rows[i][0]), s1 = Math.min(b, rows[i + 1] ? rows[i + 1][0] : now); if (s1 <= s0) continue;
      var st = rows[i][1], d = s1 - s0;
      if (st === 'deep_sleep') o.deep += d; else if (st === 'light_sleep') o.light += d;
      else if (st === 'awake' && d < 30 * 60000 && i > 0 && SLEEPY[rows[i - 1][1]] && rows[i + 1] && SLEEPY[rows[i + 1][1]]) o.awake += d;
    }
    return o;
  }
  /** Sleep per day inside [a, b): totals of the days that have sleep recorded, and how many such days (for a fair average). */
  function sleepDays(rows, a, b, now) {
    var o = { deep: 0, light: 0, awake: 0, n: 0 };
    for (var d = a; d < b; d = addDays(d, 1)) { var s = sleepIn(rows, d, Math.min(addDays(d, 1), b), now); if (s.deep + s.light > 0) { o.deep += s.deep; o.light += s.light; o.awake += s.awake; o.n++; } }
    return o;
  }
  var dateStrip = HX.strip();      // one strip for this tab, kept across its redraws
  /** pageHistory(ctx, cfg, ids, redraw) -> { el }: the History tab, the user's History reference (2026-11-19). Day / Week / Month and
   *  any date: heart rate and oxygen from Home Assistant's statistics (avg, min, max), sleep and activity from the recorded states,
   *  the last 7 days side by side, and the chosen time against the 7 days (or the week / month) before it. All real readings. */
  function pageHistory(ctx, cfg, ids, redraw) {
    var t = T(ctx), lang = ctx.lang(), now = Date.now(), today = dayStart(now);
    var FD = g.OkieMotor.feeds, mode = histView.mode, anc = histView.day != null && histView.day <= today ? histView.day : today;
    // the same periods as the Calendar: a day, a week (Monday to Sunday), a month
    var A = mode === 'month' ? new Date(new Date(anc).getFullYear(), new Date(anc).getMonth(), 1).getTime() : mode === 'week' ? FD.weekStart(anc) : dayStart(anc);
    var Bfull = mode === 'month' ? new Date(new Date(A).getFullYear(), new Date(A).getMonth() + 1, 1).getTime() : addDays(A, mode === 'week' ? 7 : 1), B = Math.min(Bfull, now), D = dayStart(Math.min(now, Bfull - 1));
    var period = mode === 'month' ? 'day' : 'hour';
    var pA = mode === 'day' ? addDays(D, -7) : mode === 'week' ? addDays(A, -7) : new Date(new Date(A).getFullYear(), new Date(A).getMonth() - 1, 1).getTime(), pB = mode === 'day' ? D : A, pDays = Math.round((pB - pA) / DAY);
    function set(m, d) { histView.mode = m; histView.day = d; if (ctx.haptic) ctx.haptic(8); redraw(); }
    var fmtD = function (ms, o) { return new Date(ms).toLocaleDateString(lang, o); };
    var seg = h('div.osh-seg', null, ['day', 'week', 'month'].map(function (m) { return h('button' + (m === mode ? '.on' : ''), { type: 'button', onclick: function () { if (m !== mode) set(m, D); } }, t('owl.h_' + m)); }));
    // the Calendar's strip of dates, the same one (the user's rule, 2026-11-19): scrolls with the finger, picks as it goes
    var strip = dateStrip(ctx, mode, A, function (ms) { set(mode, Math.min(ms, today)); });
    function chartCard(icon, cls, title, color, unit) {
      var avg = h('div.osh-avg', null, h('span', null, t('owl.avg') + ' '), h('b', null, '--'), h('span', null, ' ' + unit)), mm = h('div.osh-mm', null, '');
      var plot = h('div.osh-plot'), yax = h('div.osh-y'), xax = h('div.osh-x');
      var el = h('div.ow-page.osh-chart.' + cls, null, h('div.osh-cl', null, h('div.ows-ch', null, h('span.osh-ic', { style: { color: color }, html: UI.icon(icon, 26) }), title), avg, mm), h('div.osh-cr', null, plot, xax), yax);
      return { el: el, avg: avg.querySelector('b'), mm: mm, plot: plot, y: yax, x: xax };
    }
    var hrC = chartCard('heart', 'osh-hr', t('owl.hr'), '#ff4d6a', 'bpm'), o2C = chartCard('lungs', 'osh-o2', t('owl.o2_long'), '#4fd6e8', '%');
    tapOpen(hrC.el, ctx, ids.heartRate); tapOpen(o2C.el, ctx, ids.o2);
    var slNum = h('div.osh-big', null, '--'), slDelta = h('div.osh-delta'), slBar = h('div.owd-stages.osh-bar'), slLeg = h('div.owd-legend.osh-leg');
    var sleepC = h('div.ow-page.osh-sleep', null, h('div.osh-sl', null, h('div.ows-ch', null, h('span', { html: UI.icon('bed', 26) }), mode === 'day' ? t('owl.sleep') : t('owl.sleep_davg')), slNum, slDelta), h('div.osh-sr', null, slBar, slLeg));
    var acNum = h('div.osh-big', null, '--'), acDelta = h('div.osh-delta'), acBars = h('div.owd-abars.osh-abars');
    var actC = h('div.ow-page.osh-act', null, h('div', null, h('div.ows-ch', null, h('span', { html: UI.icon('pulse', 26) }), t('owl.activity')), acNum, acDelta), acBars);
    var wkBars = h('div.osh-wk'), wkC = h('div.ow-page.osh-week', null, h('div.ows-ch', null, h('span', { html: UI.icon('chart', 26) }), t('owl.weekly')), wkBars,
      h('div.owd-legend.osh-wkleg', null, h('span', null, h('i', { style: { background: '#7b5cff' } }), t('owl.avg_hr')), h('span', null, h('i', { style: { background: '#3fe0c0' } }), t('owl.avg_o2'))));
    var cmpGrid = h('div.osh-cmpg'), cmpC = h('div.ow-page.osh-cmp', null, h('div.ows-ch', null, h('span', { html: UI.icon('rows', 24) }), t('owl.compare')), cmpGrid);
    var el = h('div.owd.osh', null,
      h('div.osh-head', null, h('div.ows-head', null, h('span', { html: UI.icon('chart', 28) }), t('owl.history')), strip, seg),
      hrC.el, o2C.el, h('div.osh-r3', null, sleepC, actC), h('div.osh-r4', null, wkC, cmpC));
    // x-axis labels for the chosen range
    function xLabels(box) {
      var n = mode === 'day' ? 8 : 7, out = [];
      for (var i = 0; i < n; i++) {
        var tt = A + (Bfull - A) * i / n;
        out.push(mode === 'day' ? new Date(tt).toLocaleTimeString(lang, { hour: 'numeric' }) : mode === 'week' ? fmtD(tt, { weekday: 'short' }) : fmtD(tt, { month: 'short', day: 'numeric' }));
      }
      out.forEach(function (s, i) { box.appendChild(h('span', { style: { left: (i / n * 100) + '%' } }, s)); });
    }
    function fill(C, rows, color, id, stepY, floor, cap, dec) {
      var s = summary(rows);
      C.avg.textContent = s ? (dec ? s.avg.toFixed(dec) : Math.round(s.avg)) : '--';
      C.mm.textContent = s ? t('owl.min_max', { a: Math.round(s.min), b: Math.round(s.max), u: C === o2C ? '%' : '' }) : t('owl.no_read');
      var sc = niceScale(s, stepY, floor, cap);
      C.plot.innerHTML = lineChart(rows, color, id, A, Bfull, sc[0], sc[1]);
      C.y.innerHTML = ''; for (var i = 4; i >= 0; i--) C.y.appendChild(h('span', null, String(Math.round(sc[0] + (sc[1] - sc[0]) * i / 4))));
      xLabels(C.x);
      return s;
    }
    var mv = moveId(ctx);
    Promise.all([
      series(ctx, ids.heartRate, A, B, period), series(ctx, ids.o2, A, B, period),
      series(ctx, ids.heartRate, mode === 'day' ? pA : addDays(D, -6), mode === 'day' ? pB : Bfull, 'day'), series(ctx, ids.o2, mode === 'day' ? pA : addDays(D, -6), mode === 'day' ? pB : Bfull, 'day'),
      mode === 'day' ? null : series(ctx, ids.heartRate, pA, pB, 'day'), mode === 'day' ? null : series(ctx, ids.o2, pA, pB, 'day'),
      statesIn(ctx, [ids.sleepState].concat(mv ? [mv] : []), Math.min(pA, addDays(D, -6)) - DAY, B),
      mode === 'day' ? series(ctx, ids.heartRate, addDays(D, -6), Bfull, 'day') : null, mode === 'day' ? series(ctx, ids.o2, addDays(D, -6), Bfull, 'day') : null,
    ]).then(function (R) {
      if (mode === 'week') { R[0] = merge3h(R[0]); R[1] = merge3h(R[1]); }
      var hrS = fill(hrC, R[0], '#5ee08f', 'oshhr', 5, 80, null, 0), o2S = fill(o2C, R[1], '#4fd6e8', 'osho2', 1, 94, 100, 0);
      var prevHr = summary(mode === 'day' ? R[2] : R[4]), prevO2 = summary(mode === 'day' ? R[3] : R[5]);
      var wkHr = mode === 'day' ? R[7] : R[2], wkO2 = mode === 'day' ? R[8] : R[3];
      var S = R[6] || {}, ssRows = S[ids.sleepState] || [], mvRows = mv ? (S[mv] || []) : null;
      // sleep: total in the chosen time (a day, or the average per day), split into stages, against the time before
      var cur = sleepDays(ssRows, A, B, now), days = Math.max(1, (B - A) / DAY), curT = (cur.deep + cur.light) / (mode === 'day' ? 1 : Math.max(1, cur.n));
      var prevA = mode === 'day' ? addDays(D, -1) : pA, prev = sleepDays(ssRows, prevA, mode === 'day' ? D : pB, now), prevT = prev.n ? (prev.deep + prev.light) / (mode === 'day' ? 1 : prev.n) : 0;
      var hasSleep = ssRows.length > 0, dd = fmtDur(curT);
      slNum.innerHTML = hasSleep ? '<b>' + dd.h + '</b><span>h</span> <b>' + dd.m + '</b><span>m</span>' : '--';
      function delta(el, diff, txt, vs) { el.innerHTML = ''; if (diff == null) return; el.appendChild(h('span.ows-arr' + (diff < 0 ? '.dn' : ''), { html: ARROW })); el.appendChild(h('b', null, txt)); el.appendChild(document.createTextNode(' ' + vs)); }
      var vsTxt = mode === 'day' ? t('owl.vs_yday') : t(mode === 'week' ? 'owl.vs_prev_w' : 'owl.vs_prev_m');
      if (hasSleep && prevT > 0) { var dm = Math.round((curT - prevT) / 60000); delta(slDelta, dm, (dm >= 0 ? '+' : '') + dm + ' ' + t('owl.min'), vsTxt); }
      var tot = Math.max(1, cur.deep + cur.light + cur.awake);
      if (cur.deep + cur.light > 0) [['deep', cur.deep, 'var(--owd-deep)'], ['light', cur.light, 'var(--owd-light)'], ['awake', cur.awake, 'var(--owd-awake)']].forEach(function (p) { slBar.appendChild(h('i', { style: { width: (p[1] / tot * 100) + '%', background: p[2] } })); slLeg.appendChild(h('span', null, h('i', { style: { background: p[2] } }), t('owl.st_' + p[0]) + ' ', h('b', null, Math.round(p[1] / tot * 100) + '%'))); });
      else slLeg.textContent = t('owl.no_sleep');
      // activity: minutes the sock felt movement (its Movement sensor, off in Home Assistant until the user turns it on)
      if (mvRows) {
        var bins = [], nb = mode === 'day' ? 8 : 7, bw = (Bfull - A) / nb, actIn = function (a, b) { var on = 0; mvRows.forEach(function (r, i) { var s0 = Math.max(a, r[0]), s1 = Math.min(b, mvRows[i + 1] ? mvRows[i + 1][0] : now); if (s1 > s0 && parseFloat(r[1]) > 0) on += s1 - s0; }); return on / 60000; };
        for (var i = 0; i < nb; i++) bins.push(actIn(A + i * bw, A + (i + 1) * bw));
        var am = Math.round(actIn(A, B) / (mode === 'day' ? 1 : Math.ceil(days))), pm = Math.round(actIn(mode === 'day' ? addDays(D, -1) : pA, mode === 'day' ? D : pB) / (mode === 'day' ? 1 : pDays));
        acNum.innerHTML = '<b>' + am + '</b><span>' + t('owl.min') + '</span>'; delta(acDelta, am - pm, (am - pm >= 0 ? '+' : '') + (am - pm) + ' ' + t('owl.min'), vsTxt);
        var mxb = Math.max.apply(null, bins.concat([1])); bins.forEach(function (v) { acBars.appendChild(h('i', { style: { height: Math.max(8, v / mxb * 100) + '%' } })); });
      } else { acDelta.textContent = t('owl.sensor_off'); }
      // the last 7 days: average heart rate and oxygen per day, side by side (fixed scales: 70-170 bpm, 85-100 %)
      for (var k = 6; k >= 0; k--) {
        var d0 = addDays(D, -k), hv = (wkHr || []).filter(function (r) { return dayStart(r.t) === d0; })[0], ov = (wkO2 || []).filter(function (r) { return dayStart(r.t) === d0; })[0];
        var hp = hv ? Math.max(6, Math.min(100, (hv.mean - 70) / 100 * 100)) : 0, op = ov ? Math.max(6, Math.min(100, (ov.mean - 85) / 15 * 100)) : 0;
        wkBars.appendChild(h('div.osh-wkd', null, h('div.osh-wkb', null,
          h('i', { style: { height: hp + '%', background: 'linear-gradient(180deg,#9a7bff,#6a4be0)' }, title: hv ? Math.round(hv.mean) + ' bpm' : '--' }),
          h('i', { style: { height: op + '%', background: 'linear-gradient(180deg,#5ef0d0,#2fb89a)' }, title: ov ? Math.round(ov.mean) + '%' : '--' })), h('span', null, fmtD(d0, { weekday: 'short' }))));
      }
      // comparison: the chosen time against the 7 days before it (Day) or the week / month before
      var vs2 = mode === 'day' ? t('owl.vs_7d') : vsTxt;
      function cmp(icon, color, label, valHtml, diff, dtxt) {
        var dEl = h('div.osh-delta'); if (diff != null) delta(dEl, diff, dtxt, ''); 
        return h('div.osh-cmpi', null, h('div.osh-cmph', null, h('span', { style: { color: color }, html: UI.icon(icon, 20) }), label), h('div.osh-cmpv', { html: valHtml }), dEl, h('div.osh-cmpvs', null, vs2));
      }
      var dHr = hrS && prevHr ? Math.round(hrS.avg - prevHr.avg) : null, dO2 = o2S && prevO2 ? Math.round(o2S.avg - prevO2.avg) : null;
      var p7 = mode === 'day' ? (function () { var s = sleepIn(ssRows, addDays(D, -7), D, now); return (s.deep + s.light) / 7; })() : prevT, dSl = hasSleep && p7 > 0 ? Math.round((curT - p7) / 60000) : null;
      cmpGrid.appendChild(cmp('heart', '#ff4d6a', t('owl.hr'), hrS ? '<b>' + Math.round(hrS.avg) + '</b><span>bpm</span>' : '--', dHr, (dHr >= 0 ? '+' : '') + dHr + ' bpm'));
      cmpGrid.appendChild(cmp('lungs', '#4fd6e8', t('owl.oxygen'), o2S ? '<b>' + Math.round(o2S.avg) + '</b><span>%</span>' : '--', dO2, (dO2 >= 0 ? '+' : '') + dO2 + '%'));
      cmpGrid.appendChild(cmp('bed', '#9a7bff', t('owl.sleep'), hasSleep ? '<b>' + dd.h + '</b><span>h</span><b>' + dd.m + '</b><span>m</span>' : '--', dSl, (dSl >= 0 ? '+' : '') + dSl + ' ' + t('owl.min')));
    });
    return { el: el };
  }

  // ------------------------------------------------ Settings: the user's Settings reference (2026-11-19) ----
  function owSet(ctx) { return ctx.settings.get().owlet || {}; }
  function hm(s) { var m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; }
  /** Inside the sleep schedule now (it may run past midnight)? */
  function inSchedule(ctx, now) {
    var sc = owSet(ctx).schedule || {}, a = hm(sc.from), b = hm(sc.to); if (a == null || b == null) return true;
    var d = new Date(now || Date.now()), m = d.getHours() * 60 + d.getMinutes();
    return a <= b ? m >= a && m < b : m >= a || m < b;
  }
  function clock(lang, s) { var v = hm(s); if (v == null) return '--'; var d = new Date(2000, 0, 1, Math.floor(v / 60), v % 60); return d.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }); }
  /** The Owlet's own notices for the notification center (Settings > Monitoring and Alerts): heart rate and oxygen outside the
   *  levels set here, the sock off during the sleep schedule, and a waking during it. Only from the sock's real readings, and only
   *  while it reads (not on the base). These come on top of Owlet's own alarms, they never replace them. */
  function owletAlerts(ctx) {
    var cfg = sockOnlyConfig(ctx), ids = sockIds(cfg); if (!ids) return [];
    var o = owSet(ctx), tr = o.track || {}, al = o.alerts || {}, t = T(ctx), out = [], who = (o.babyName || '').trim() || t('owl.sock_title');
    var ts = function (id) { var st = ctx.state(id); return (st && Date.parse(st.last_changed)) || Date.now(); };
    var mk = function (k, sev, text, id) { out.push({ id: 'owlet:' + k, severity: sev, source: 'owlet', title: who, text: text, ts: ts(id), entity: id }); };
    var on = function (k) { return al[k] && al[k].on !== false; };
    if (sockLive(ctx, ids)) {
      var hr = num(ctx, ids.heartRate), o2 = num(ctx, ids.o2);
      if (tr.hr !== false && hr != null && on('lowHr') && hr < +al.lowHr.v) mk('lowhr', 'critical', t('owl.al_low_hr_n', { v: Math.round(hr) }), ids.heartRate);
      if (tr.hr !== false && hr != null && on('highHr') && hr > +al.highHr.v) mk('highhr', 'critical', t('owl.al_high_hr_n', { v: Math.round(hr) }), ids.heartRate);
      if (tr.o2 !== false && o2 != null && on('lowO2') && o2 < +al.lowO2.v) mk('lowo2', 'critical', t('owl.al_low_o2_n', { v: Math.round(o2) }), ids.o2);
      var ss = ctx.state(ids.sleepState);
      if (tr.sleep !== false && ss && ss.state === 'awake' && inSchedule(ctx) && Date.now() - ts(ids.sleepState) < 20 * 60000) mk('awake', 'info', t('owl.al_awake_n'), ids.sleepState);
    }
    var off = ctx.state(ids.sockOff);
    if (on('sockOff') && off && off.state === 'on' && inSchedule(ctx)) mk('sockoff', 'warning', t('owl.al_sock_off_n'), ids.sockOff);
    return out;
  }
  (g.OkieMotor.alertSources = g.OkieMotor.alertSources || []).push(owletAlerts);

  /** The baby's photo (Settings > Profile) as a round picture, else the person icon. */
  function babyPhoto(ctx, size) {
    var el = h('div.osp-photo', { style: { width: size + 'px', height: size + 'px' }, html: UI.icon('person', Math.round(size * 0.46)) }), m = owSet(ctx).photo;
    if (m && m.id && UI.mediaUrl) UI.mediaUrl(ctx, m.id).then(function (u) { if (u) { el.innerHTML = ''; el.style.backgroundImage = 'url("' + u + '")'; el.classList.add('has'); } });
    return el;
  }
  function iosSwitch(on, label, onChange) {
    var sw = h('button.ios-switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label }, h('span.dot'));
    sw.addEventListener('click', function () { var nv = sw.getAttribute('aria-checked') !== 'true'; sw.classList.toggle('on', nv); sw.setAttribute('aria-checked', nv ? 'true' : 'false'); onChange(nv); });
    return sw;
  }
  /** pageSettings(ctx, cfg, ids, go, redraw) -> { el }: the Settings tab. Sock and battery (real), what the card watches and its alert
   *  levels (the card's own notices), the sleep schedule and goal, the baby's profile (name, birth date, photo) and the linked devices. */
  function pageSettings(ctx, cfg, ids, go, redraw) {
    var t = T(ctx), lang = ctx.lang(), o = owSet(ctx), s = statusFor(ctx, cfg);
    var put = function (v) { ctx.settings.set({ owlet: v }); if (ctx.haptic) ctx.haptic(8); };
    var hrSt = ctx.state(ids.heartRate), sockName = (o.babyName || '').trim() ? t('owl.sock_of', { n: o.babyName.trim() }) : t('owl.smart_sock');
    var head = h('div.osp-head', null, h('span.osp-gear', { html: UI.icon('gear', 34) }), h('div', null, h('div.osp-title', null, t('card.settings')), h('div.osp-sub', null, t('owl.smart_sock'))));
    var sockC = h('button.ow-page.osp-sock.owh', { type: 'button', onclick: function () { if (ctx.haptic) ctx.haptic(8); go('live'); } },
      h('div.osp-sart', { html: bootieArt() }), h('div.osp-st', null, h('b', null, 'Owlet Sock'), h('span', null, sockName), h('span.owh-status', null, h('span.owh-dot'), s.level === 'off' ? t('owl.tag_off') : s.level === 'idle' ? s.label : t('owl.connected'))), h('span.owl-chev', { html: UI.icon('chevron', 20) }));
    sockC.dataset.level = s.level;
    var bp = num(ctx, ids.batteryPct), chg = (ctx.state(ids.charging) || {}).state === 'on', rem = num(ctx, 'sensor.' + cfg.sockPrefix + '_battery_remaining');
    var tone = UI.batteryTone ? UI.batteryTone(bp) : 'ok';
    var battC = h('div.ow-page.osp-batt', null, h('div.osp-bl', null, h('div.osp-bt', null, t('owl.battery_t')), h('div.osp-bv', null, UI.battery(bp, chg, t('owl.tag_charging'))), rem != null && !chg ? h('div.osp-brem', null, t('owl.batt_left', { h: Math.round(rem) })) : null),
      h('div.osp-bbar.' + tone, null, h('i', { style: { width: (bp != null ? Math.max(2, Math.min(100, bp)) : 0) + '%' } })));
    function card(icon, title, sub, rows, cls) { return h('div.ow-page.osp-card' + (cls ? '.' + cls : ''), null, h('div.osp-ch', null, h('span', { html: UI.icon(icon, 26) }), h('div', null, h('b', null, title), h('span', null, sub))), h('div.osp-rows', null, rows)); }
    function row(icon, label, right, color) { return h('div.osp-row', null, h('span.osp-ri', { style: color ? { color: color } : null, html: UI.icon(icon, 22) }), h('span.osp-rl', null, label), right); }
    var tr = o.track || {};
    var mon = [
      row('heart', t('owl.hr'), iosSwitch(tr.hr !== false, t('owl.hr'), function (v) { put({ track: { hr: v } }); }), '#ff4d6a'),
      row('lungs', t('owl.o2_long'), iosSwitch(tr.o2 !== false, t('owl.o2_long'), function (v) { put({ track: { o2: v } }); })),
      row('bed', t('owl.sleep_track'), iosSwitch(tr.sleep !== false, t('owl.sleep_track'), function (v) { put({ track: { sleep: v } }); })),
    ];
    // Baby monitor mode (2026-11-20): the Kindle Deck's switch "Baby monitor" (also by voice): the Kindle shows the Owlet camera screen
    var babySw = Object.keys((ctx.hass() || {}).states || {}).filter(function (k) { return /^switch\.[a-z0-9_]*baby_monitor$/.test(k); })[0];
    mon.push(row('tablet', t('owl.baby_mode'), iosSwitch(!!(babySw && (ctx.state(babySw) || {}).state === 'on'), t('owl.baby_mode'), function (v) {
      if (!babySw) { if (ctx.toast) ctx.toast('info', t('owl.baby_missing')); return; }
      ctx.call('switch', v ? 'turn_on' : 'turn_off', { entity_id: babySw }).catch(function () { if (ctx.toast) ctx.toast('warn', t('owl.baby_fail')); });
    })));
    if (cfg.recordingEntity) mon.push(row('camera', t('owl.recording'), iosSwitch(!!((ctx.settings.get().cameras || {}).owlet || {}).recordOn, t('owl.recording'), function (v) { ctx.settings.set({ cameras: { owlet: { recordOn: v } } }); })));
    var al = o.alerts || {};
    function lvl(k, opts, fmt) {
      var cur = al[k] || {}, sel = h('select.osp-sel', { 'aria-label': t('owl.al_' + k) }, opts.map(function (v) { return h('option', { value: String(v), selected: +cur.v === v }, fmt(v)); }));
      sel.addEventListener('change', function () { var v = {}; v[k] = { v: +sel.value }; put({ alerts: v }); });
      return h('label.osp-pill', null, sel, h('span', { html: UI.icon('chevdown', 14) }));
    }
    function alSw(k) { return iosSwitch(!al[k] || al[k].on !== false, t('owl.al_' + k), function (v) { var x = {}; x[k] = { on: v }; put({ alerts: x }); }); }
    var range = function (a, b, st) { var r = []; for (var v = a; v <= b; v += st) r.push(v); return r; };
    var alerts = [
      row('heart', t('owl.al_lowHr'), h('div.osp-rr', null, lvl('lowHr', range(60, 110, 5), function (v) { return '< ' + v + ' bpm'; }), alSw('lowHr')), '#ff4d6a'),
      row('heart', t('owl.al_highHr'), h('div.osp-rr', null, lvl('highHr', range(150, 220, 5), function (v) { return '> ' + v + ' bpm'; }), alSw('highHr')), '#ff4d6a'),
      row('lungs', t('owl.al_lowO2'), h('div.osp-rr', null, lvl('lowO2', range(80, 96, 1), function (v) { return '< ' + v + '%'; }), alSw('lowO2'))),
      row('signal', t('owl.al_sockOff'), h('div.osp-rr', null, alSw('sockOff'))),
    ];
    var sc = o.schedule || {};
    var schedBtn = h('button.osp-pill', { type: 'button', onclick: function (e) { editSchedule(e.currentTarget); } }, clock(lang, sc.from) + ' – ' + clock(lang, sc.to), h('span', { html: UI.icon('chevron', 14) }));
    function editSchedule(origin) {
      ctx.sheet({ title: t('owl.schedule'), origin: origin, width: 'min(420px,100%)', content: function (close) {
        var a = h('input.osp-in', { type: 'time', value: sc.from || '20:00' }), b = h('input.osp-in', { type: 'time', value: sc.to || '07:00' });
        return h('div.osp-form', null, h('label', null, h('span', null, t('owl.bedtime')), a), h('label', null, h('span', null, t('owl.wake_time')), b),
          h('button.osp-save', { type: 'button', onclick: function () { put({ schedule: { from: a.value || '20:00', to: b.value || '07:00' } }); close('save'); redraw(); } }, t('owl.save')));
      } });
    }
    var goal = h('select.osp-sel', { 'aria-label': t('owl.sleep_goal') }, range(6, 18, 1).map(function (v) { return h('option', { value: String(v), selected: (+o.sleepGoalH || 10) === v }, v + ' h'); }));
    goal.addEventListener('change', function () { put({ sleepGoalH: +goal.value }); });
    var prefs = [row('moon', t('owl.schedule'), schedBtn), row('chart', t('owl.sleep_goal'), h('label.osp-pill', null, goal, h('span', { html: UI.icon('chevdown', 14) })))];
    var prof = h('button.osp-prof', { type: 'button', onclick: function (e) { editProfile(e.currentTarget); } }, babyPhoto(ctx, 50), h('div.osp-pt', null, h('b', null, (o.babyName || '').trim() || t('owl.add_name')), h('span', null, babyLine(ctx, t) !== t('owl.smart_sock') ? babyLine(ctx, t).split(' • ').slice(-1)[0] : t('owl.add_birth'))), h('span', { html: UI.icon('chevron', 20) }));
    function editProfile(origin) {
      ctx.sheet({ title: t('owl.profile'), origin: origin, width: 'min(440px,100%)', content: function (close) {
        var name = h('input.osp-in', { type: 'text', value: o.babyName || '', placeholder: t('owl.name'), maxLength: 40 });
        var bd = h('input.osp-in', { type: 'date', value: o.birthDate || '', max: new Date().toISOString().slice(0, 10) });
        var pic = h('div.osp-picw', null, babyPhoto(ctx, 84)), msg = h('div.osp-msg');
        var file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: function () {
          var f = file.files && file.files[0]; file.value = ''; if (!f) return; msg.textContent = t('owl.uploading');
          UI.mediaUpload(ctx, f, 'okie-hero', 'owlet-baby').then(function (m) { put({ photo: m }); msg.textContent = ''; pic.innerHTML = ''; pic.appendChild(babyPhoto(ctx, 84)); redraw(); },
            function (e) { msg.textContent = core.t(e === 'type' ? 'dt.hero_bad_type' : e === 'size' ? 'dt.hero_too_big' : e === 'admin' ? 'dt.hero_admin' : 'dt.hero_failed', lang); });
        } });
        return h('div.osp-form', null,
          h('div.osp-picrow', null, pic, h('div.osp-picb', null, h('button.osp-btn', { type: 'button', onclick: function () { file.click(); } }, t(o.photo ? 'owl.photo_change' : 'owl.photo_add')),
            o.photo ? h('button.osp-btn.ghost', { type: 'button', onclick: function () { put({ photo: null }); pic.innerHTML = ''; pic.appendChild(babyPhoto(ctx, 84)); redraw(); } }, t('owl.photo_remove')) : null, msg), file),
          h('label', null, h('span', null, t('owl.name')), name), h('label', null, h('span', null, t('owl.birth')), bd),
          h('button.osp-save', { type: 'button', onclick: function () { put({ babyName: name.value.trim(), birthDate: bd.value || '' }); close('save'); redraw(); } }, t('owl.save')));
      } });
    }
    var camId = owletCam(ctx, cfg, ids), cam = camId && ctx.state(camId), camOk = cam && cam.state !== 'unavailable' && cam.state !== 'unknown';
    function dev(art, name, ok, okTxt, offTxt, onClick) { return h('button.osp-dev', { type: 'button', onclick: onClick }, h('div.osp-dart', { html: art }), h('div.osp-dt', null, h('b', null, name), h('span', null, h('i' + (ok ? '.on' : '')), ok ? okTxt : offTxt)), h('span', { html: UI.icon('chevron', 18) })); }
    var devices = h('div.ow-page.osp-devs', null, h('div.osp-ch', null, h('span', { html: UI.icon('link', 30) }), h('div', null, h('b', null, t('owl.devices')), h('span', null, t('owl.devices_sub')))),
      dev(bootieArt(), 'Owlet Sock', s.level !== 'off', t('owl.connected'), t('owl.tag_off'), function () { go('live'); }),
      dev(UI.icon('camera', 30), t('owl.cam'), !!camOk, t('owl.connected'), camId ? t('owl.not_conn') : t('owl.not_set'), function () { if (camId && ctx.openDetail) ctx.openDetail(camId); else ctx.openApp('settings'); }));
    var el = h('div.owd.osp', null, head,
      h('div.osp-r1', null, sockC, battC),
      h('div.osp-r2', null, card('pulse', t('owl.monitoring'), t('owl.monitoring_sub'), mon), card('bell', t('owl.alerts'), t('owl.alerts_sub'), alerts)),
      h('div.osp-r3', null, card('bed', t('owl.sleep_prefs'), t('owl.sleep_prefs_sub'), prefs), h('div.ow-page.osp-card.osp-profc', null, h('div.osp-ch', null, h('span', { html: UI.icon('person', 30) }), h('div', null, h('b', null, t('owl.profile')), h('span', null, t('owl.profile_sub')))), prof)),
      devices);
    return { el: el };
  }

  /** renderOwletApp(container, ctx): the full-screen Owlet Sock app, same frame as every other app/device
   *  screen (okie-appshell.js) - back button, hero, pencil to resize it, and this screen's own tabs, reusing
   *  the exact same page builders as panel() (just driven through appshell's tab bar instead of panel()'s own). */
  function renderOwletApp(container, ctx) {
    var t = T(ctx), cfg = sockOnlyConfig(ctx);
    if (!cfg) { container.appendChild(h('div.dt-empty', null, t('owl.demo'))); return; }
    var ids = sockIds(cfg), refreshTab = function () { if (shell.tab) shell.showTab(shell.tab); };
    function subtitleText() { var live = sockLive(ctx, ids), ss = ids && ctx.state(ids.sleepState); return ids ? (live ? sleepLabel(t, ss && ss.state) : t('owl.sock_idle')) : ''; }
    var startTab = pendingTab; pendingTab = null;      // a button on the camera screen (readings, sleep, settings) asks for a tab
    var shell = g.OkieMotor.appshell.create(container, ctx, {
      id: 'owlet', startTab: startTab, title: t('owl.sock_title'), subtitle: subtitleText(), icon: 'heart', gradient: ['#15313a', '#1f5c52'],
      actions: ctx.favorites ? [{ icon: 'heart', label: t('owl.pin'), onClick: function (e) { var on = ctx.favorites.toggle('gadget.owlet'); var b = e && e.currentTarget; if (b) { b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); } if (ctx.haptic) ctx.haptic(10); } }] : [],
      tabs: [
        { id: 'overview', icon: 'home', label: t('owl.comfort') },
        { id: 'live', icon: 'pulse', label: t('owl.live_readings') },
        { id: 'sleep', icon: 'moon', label: t('owl.morning') },
        { id: 'history', icon: 'chart', label: t('owl.trends') },
        { id: 'settings', icon: 'gear', label: t('card.settings') },
      ],
      onTab: function (id, body) {
        var parts = id === 'overview' ? [pageDashboard(ctx, cfg, ids)]      // the user's Health Dashboard reference (2026-11-19)
          : id === 'live' ? [pageLive(ctx, cfg, ids, function (tb) { shell.showTab(tb); })]      // the user's Live Monitoring reference (2026-11-19)
          : id === 'sleep' ? [pageSleep(ctx, cfg, ids)]      // the user's Sleep reference (2026-11-19)
          : id === 'settings' ? (ids ? [pageSettings(ctx, cfg, ids, function (tb) { shell.showTab(tb); }, function () { refreshTab(); })] : [pageOwletSettings(ctx, cfg)])      // the user's Settings reference (2026-11-19)
          : id === 'history' && ids ? [pageHistory(ctx, cfg, ids, function () { refreshTab(); })]      // the user's History reference (2026-11-19)
          : sockIds(cfg) ? [pageTrends(ctx, cfg)] : [pageTrends(ctx, cfg), pageHealth(ctx, cfg)];
        parts.forEach(function (p) { body.appendChild(p.el); });
      },
    });
    var pinBtn = shell.el.querySelector('.dt-circ.act'); if (pinBtn && ctx.favorites && ctx.favorites.has) { var pinned = ctx.favorites.has('gadget.owlet'); pinBtn.classList.toggle('on', pinned); pinBtn.setAttribute('aria-pressed', pinned ? 'true' : 'false'); }
    // a redraw of the same tab (the 15 s refresh, a new date) keeps the place you scrolled to (on a phone the pages scroll)
    var scrollerOf = function () { return shell.el.querySelector('.dt-body'); };
    refreshTab = function () { var b = scrollerOf(), top = b ? b.scrollTop : 0; if (shell.tab) shell.showTab(shell.tab); var b2 = scrollerOf(); if (b2 && top) { b2.scrollTop = top; requestAnimationFrame(function () { b2.scrollTop = top; }); } };
    // on a phone: swipe left or right to the next or previous tab (not on the date strip, a field or a switch)
    var ORDER = ['overview', 'live', 'sleep', 'history', 'settings'], sw = null, phone = function () { return g.matchMedia && g.matchMedia('(max-width: 700px)').matches; };
    shell.el.addEventListener('touchstart', function (e) {
      sw = null; if (!phone() || e.touches.length !== 1) return;
      var path = e.composedPath ? e.composedPath() : [e.target];
      if (path.some(function (n) { return n && n.classList && (n.classList.contains('cal-strip') || n.classList.contains('dt-bar') || n.classList.contains('osh-plot')) || (n && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName || '')); })) return;
      sw = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }, { passive: true });
    shell.el.addEventListener('touchend', function (e) {
      if (!sw) return; var c = e.changedTouches[0], dx = c.clientX - sw.x, dy = c.clientY - sw.y, dt = Date.now() - sw.t; sw = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || dt > 800) return;
      var i = ORDER.indexOf(shell.tab), j = i + (dx < 0 ? 1 : -1); if (i < 0 || j < 0 || j >= ORDER.length) return;
      if (ctx.haptic) ctx.haptic(10); shell.showTab(ORDER[j]);
    }, { passive: true });
    var timer = setInterval(function () { shell.setSubtitle(subtitleText()); refreshTab(); }, 15000);
    return { dispose: function () { clearInterval(timer); shell.dispose(); } };
  }
  if (g.OkieMotor.apps) g.OkieMotor.apps.register({ id: 'owlet', nameKey: 'owl.sock_title', name: 'Owlet Sock', icon: 'heart', color: '#30d6c4', order: 65, category: 'system', render: renderOwletApp });

  var CSS = [
    // the live feed replaces the hero's big camera icon, same trick the other camera heroes use
    '.dt[data-owlet-hero="1"] .dt-iconbg,.dt[data-owlet-hero="1"] .dt-video{display:none;}',
    '.owlet-hero-wrap{position:absolute;inset:0;}',
    '.owlet-hero-wrap .cam-player{position:absolute;inset:0;width:100%;height:100%;margin:0;aspect-ratio:auto;border-radius:0;-webkit-clip-path:none;clip-path:none;cursor:default;}',
    '.owlet-hero-wrap .cam-player .cam-snap{object-fit:cover;}',
    '.ow-badge{position:absolute;top:14px;right:14px;display:flex;gap:8px;z-index:3;}',
    '.ow-badge-i{display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:999px;background:rgba(10,14,22,.55);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.5),24px));backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.5),24px));color:#fff;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;}',
    '.ow-badge-i svg{opacity:.9;}',
    '.ow-panel{display:flex;flex-direction:column;align-items:center;gap:12px;padding:2px 2px 4px;}',
    '.ow-host{display:flex;flex-direction:column;gap:10px;width:100%;}',
    '.ow-tap{cursor:pointer;transition:background-color .2s ease;}.ow-tap:active{background-color:rgba(255,255,255,.14);}',
    '.ow-page{min-width:0;display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:18px;background:var(--okie-tile,rgba(255,255,255,.08));-webkit-backdrop-filter:var(--okie-card-bf,none);backdrop-filter:var(--okie-card-bf,none);border:0;box-shadow:var(--okie-card-edge,none);box-sizing:border-box;}',
    '.ow-head{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;}',
    '.ow-head svg{flex:none;}',
    '.ow-demo{margin-left:auto;font-size:10.5px;font-weight:700;opacity:.6;text-align:right;max-width:120px;line-height:1.25;}',
    '.ow-bigrow{display:flex;align-items:baseline;gap:4px;}',
    '.ow-big{font-size:48px;font-weight:700;letter-spacing:-.02em;}',
    '.ow-unit{font-size:20px;font-weight:600;opacity:.65;}',
    '.ow-zone{position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,#34c6ff,#8ef0c0,#ffcf5c,#ff8a5c);margin-top:2px;}',
    '.ow-zone-dot{position:absolute;top:50%;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid rgba(0,0,0,.25);box-shadow:0 1px 4px rgba(0,0,0,.4);transform:translate(-50%,-50%);transition:left .4s;}',
    '.ow-zone-labels{display:flex;justify-content:space-between;font-size:11px;font-weight:600;opacity:.6;}',
    '.ow-sub-row{display:flex;align-items:center;gap:8px;font-size:13.5px;opacity:.9;}',
    '.ow-sub-row b{margin-left:auto;font-variant-numeric:tabular-nums;}',
    '.ow-sub-row.ow-center{justify-content:center;}',
    '.ow-subhead{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;opacity:.55;margin-top:2px;}',
    '.ow-bars{display:flex;gap:6px;height:84px;flex:none;}',
    '.ow-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;}',
    '.ow-bar-track{flex:1;width:10px;border-radius:5px;background:rgba(255,255,255,.12);display:flex;align-items:flex-end;}',
    '.ow-bar-fill{width:100%;border-radius:5px;background:linear-gradient(180deg,#7fd8ff,#3a8bff);}',
    '.ow-bar-v{font-size:10px;font-weight:700;opacity:.8;}',
    '.ow-bar-l{font-size:10px;font-weight:600;opacity:.55;}',
    '.ow-dots-row{display:flex;gap:6px;height:44px;flex:none;}',
    '.ow-dot-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;}',
    '.ow-dot-track{position:relative;flex:1;width:100%;}',
    '.ow-dot{position:absolute;left:50%;width:8px;height:8px;border-radius:50%;background:#ff7fb0;transform:translate(-50%,50%);}',
    '.ow-ring{position:relative;flex:none;width:118px;height:118px;border-radius:50%;margin:4px auto;background:conic-gradient(#30d6c4 var(--ow-ring-deg,0deg),rgba(255,255,255,.12) 0);display:flex;align-items:center;justify-content:center;}',
    '.ow-ring-face{width:94px;height:94px;border-radius:50%;background:var(--okie-card-bg,rgba(10,14,22,.85));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center;}',
    '.ow-ring-face b{font-size:13.5px;font-weight:700;}.ow-ring-face em{font-style:normal;font-size:10px;opacity:.6;}',
    '.ow-posrow{display:flex;align-items:center;gap:10px;font-size:13px;}',
    '.ow-posl{width:46px;flex:none;font-weight:600;opacity:.8;}',
    '.ow-postrack{flex:1;height:10px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden;}',
    '.ow-posfill{height:100%;border-radius:5px;background:linear-gradient(90deg,#8ef0c0,#30d6c4);}',
    '.ow-posv{width:38px;flex:none;text-align:right;font-variant-numeric:tabular-nums;opacity:.85;}',
    '.owc{display:flex;flex-direction:column;gap:4px;cursor:pointer;}',
    // ---- Overview = Health Dashboard (the user's reference, 2026-11-19): no coloured boxes behind text, cards are the Motor's glass (.ow-page) ----
    '.owd .ow-page{background:rgba(255,255,255,.075);box-shadow:var(--okie-card-edge,none),inset 0 1px 0 rgba(255,255,255,.07);}',      // inner cards a shade lighter than the panel, like the robot's tiles (the user: too dark)
    '.owd{min-height:100%;box-sizing:border-box;}.owd-row2{flex:1.35 1 auto;}.owd-sleep{flex:1 1 auto;}.owd-row3{flex:1.35 1 auto;}',
    '.owl .owd-row2{flex:2.2 1 auto;}.owl-row3{flex:1.1 1 auto;}.owl-strip{flex:.8 1 auto;}',
    '.owd-vital,.owl-big{justify-content:space-between;}.owd-wave,.owl-wave{margin-top:auto;}',
    '.owd-vic svg,.owl-bic svg,.owl-sic svg{stroke-width:2;filter:drop-shadow(0 0 6px currentColor);}',
    '.owd-ringw{filter:none;}.owd-ringv{text-align:center;}',
    '.owd{display:flex;flex-direction:column;gap:10px;--owd-deep:#6a4be0;--owd-light:#9a7bff;--owd-awake:#e8d5b0;}',
    '.owd-head{display:flex;align-items:center;min-height:132px;margin:0 0 2px;padding:0 4px;}',
    '.owd-left{position:relative;z-index:1;display:flex;flex-direction:column;align-items:flex-start;max-width:44%;}',
    '.owd-title{font-size:28px;font-weight:700;letter-spacing:-.01em;line-height:1.1;margin-top:8px;}',
    '.owd-baby{font-size:15px;opacity:.7;margin-top:4px;}',
    '.owd-status{font-size:15px;margin-top:8px;}',
    '.owd-head .owh-art-wrap{left:46%;width:24%;}.owd-head .owh-glow{left:44%;width:28%;}',
    '.owd-right{position:absolute;right:4px;top:8px;z-index:1;display:flex;flex-direction:column;align-items:flex-end;gap:12px;}',
    '.owd-batt{font-size:16px;font-weight:600;}.owd-conn{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;}',
    '.owd-row2,.owd-row3{display:grid;grid-template-columns:1fr 1fr;gap:12px;}.owd-row3{grid-template-columns:1fr 1.5fr;}',
    '.owd-vital{gap:4px;padding:14px 0 0;overflow:hidden;}.owd-vtop{display:flex;align-items:center;gap:16px;padding:0 20px;}',
    '.owd-vic{display:flex;flex:none;}.owd-vital.owd-hr .owd-vic{color:#5ee08f;}.owd-vital.owd-o2 .owd-vic{color:#4fd6e8;}',
    '.owd-vnum b{font-size:34px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.01em;}.owd-vnum span{font-size:18px;font-weight:500;margin-left:6px;opacity:.85;}',
    '.owd-vlab{font-size:14px;opacity:.75;margin-top:2px;}',
    '.owd-wave{height:40px;margin-top:2px;}.owd-wave svg{display:block;width:100%;height:100%;overflow:visible;}',
    '.owd-sleep{flex-direction:row;align-items:center;gap:20px;padding:12px 22px;}',
    '.owd-sic{display:flex;flex:none;opacity:.9;}.owd-sl{flex:none;min-width:0;}',
    '.owd-sh{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:600;}.owd-sh span{display:flex;color:var(--owd-light);}',
    '.owd-snum{margin-top:2px;}.owd-snum b{font-size:30px;font-weight:600;font-variant-numeric:tabular-nums;}.owd-snum span{font-size:17px;margin:0 4px 0 3px;opacity:.85;}',
    '.owd-ssince{font-size:13.5px;opacity:.7;}',
    '.owd-sr{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px;}',
    '.owd-stages{display:flex;height:22px;border-radius:11px;overflow:hidden;background:rgba(255,255,255,.08);}.owd-stages i{height:100%;}',
    '.owd-legend{display:flex;gap:18px;flex-wrap:wrap;font-size:14px;opacity:.9;}.owd-legend span{display:flex;align-items:center;gap:7px;}.owd-legend i{width:9px;height:9px;border-radius:50%;}.owd-legend b{font-weight:600;}',
    '.owd-act{gap:8px;padding:12px 18px;flex-direction:row;align-items:flex-end;}.owd-ah{display:flex;gap:12px;align-items:flex-start;}.owd-ah>span{display:flex;opacity:.9;}',
    '.owd-at{font-size:16px;font-weight:600;}.owd-anum{margin-top:4px;}.owd-anum b{font-size:26px;font-weight:600;}.owd-anum span{font-size:15px;margin-left:5px;opacity:.85;}',
    '.owd-asub{font-size:13px;opacity:.7;}',
    '.owd-abars{display:flex;align-items:flex-end;gap:7px;height:52px;margin-left:auto;}.owd-abars i{width:9px;border-radius:3px;background:linear-gradient(180deg,#5ee08f,rgba(94,224,143,.45));}',
    '.owd-prog{gap:6px;padding:12px 18px;}.owd-ph{display:flex;align-items:center;gap:12px;font-size:16px;font-weight:600;}.owd-ph>span:first-child{display:flex;}',
    '.owd-pbody{display:flex;align-items:center;gap:22px;}',
    '.owd-ring{position:absolute;inset:0;}.owd-ring svg{width:100%;height:100%;overflow:visible;display:block;}',
    '.owd-ring-old{border-radius:50%;display:grid;place-items:center;background:conic-gradient(#3fe0b0 calc(var(--p)*1%),rgba(255,255,255,.1) 0);-webkit-mask:radial-gradient(circle,transparent 32px,#000 33px);mask:radial-gradient(circle,transparent 32px,#000 33px);}',
    '.owd-ringw{position:relative;flex:none;width:80px;height:80px;}.owd-ringv{position:absolute;inset:0;display:grid;place-items:center;font-size:19px;font-weight:600;}',
    '.owd-plist{flex:1;display:flex;flex-direction:column;gap:2px;}',
    '.owd-prow{display:flex;align-items:center;gap:10px;font-size:14px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.07);}.owd-prow:last-child{border-bottom:0;}',
    '.owd-prow i{width:9px;height:9px;border-radius:50%;flex:none;}.owd-prow b{margin-left:auto;font-weight:600;display:flex;}',
    // ---- Live = the user's Live Monitoring reference (2026-11-19) ----
    '.owl-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 4px;margin-bottom:4px;}',
    '.owl-left{display:flex;flex-direction:column;align-items:flex-start;}',
    '.owl-title{font-size:38px;font-weight:700;letter-spacing:-.015em;line-height:1.1;margin-top:8px;}',
    '.owl-status{font-size:16px;margin-top:8px;}',
    '.owl-sock{flex-direction:row;align-items:center;gap:14px;padding:12px 16px;min-width:300px;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer;}',
    '.owl-sart{width:62px;height:62px;flex:none;display:flex;justify-content:center;}.owl-sart svg{height:100%;width:auto;}',
    '.owl-stxt{flex:1;display:flex;flex-direction:column;gap:8px;}.owl-st1{font-size:14px;opacity:.9;}.owl-sbatt{font-size:16px;font-weight:600;}',
    '.owl-chev{display:flex;opacity:.8;}',
    '.owl-big{gap:8px;padding:20px 0 0;overflow:hidden;}.owl-btop{display:flex;align-items:center;justify-content:center;gap:22px;padding:0 20px;}',
    '.owl-bic{display:flex;flex:none;}.owl-big.owd-hr .owl-bic{color:#5ee08f;}.owl-big.owd-o2 .owl-bic{color:#4fd6e8;}',
    '.owl-bnum b{font-size:50px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;}.owl-bnum span{font-size:26px;font-weight:500;margin-left:8px;opacity:.9;}',
    '.owl-blab{font-size:17px;opacity:.85;margin-top:2px;}',
    '.owl-wave{height:84px;margin-top:6px;}.owl-wave svg{display:block;width:100%;height:100%;overflow:visible;}',
    '.owl-row3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}',
    '.owl-small{gap:8px;padding:14px 18px;}.owl-stop{display:flex;gap:14px;align-items:flex-start;}.owl-sic{display:flex;flex:none;color:#5ee08f;}',
    '.owl-sl{font-size:15px;font-weight:500;}.owl-sv{font-size:24px;font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums;}.owl-sv span{font-size:14px;font-weight:500;opacity:.75;}.owl-mv{font-size:17px;}',
    '.owl-swave{height:30px;}.owl-swave svg{display:block;width:100%;height:100%;}',
    '.owl-sbars{display:flex;align-items:flex-end;justify-content:center;gap:5px;height:30px;}.owl-sbars i{width:5px;border-radius:2px;background:linear-gradient(180deg,#5ee08f,rgba(94,224,143,.35));}',
    '.owl-strip{flex-direction:row;align-items:center;gap:18px;padding:12px 18px;}',
    '.owl-livetag{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:600;color:#5ee08f;}.owl-livetag span:first-child{display:flex;}',
    '.owl-sep{width:1px;align-self:stretch;background:rgba(255,255,255,.1);}',
    '.owl-si{display:flex;align-items:center;gap:10px;}.owl-si>span{display:flex;opacity:.9;}.owl-si div{display:flex;flex-direction:column;}.owl-si div span{font-size:12.5px;opacity:.75;}.owl-si b{font-size:16px;font-weight:600;}',
    '.owl-stbar{flex:1;height:22px;}',
    // ---- Sleep = the user's Sleep reference (2026-11-19) ----
    '.ows-head{display:flex;align-items:center;gap:12px;font-size:21px;font-weight:700;padding:0 4px;margin-top:-4px;}.ows-head span{display:flex;opacity:.9;}',
    '.ows-r1{flex:1.15 1 auto;display:grid;grid-template-columns:1.45fr 1fr;gap:12px;}.ows-r2{flex:1 1 auto;display:grid;grid-template-columns:2.7fr 1fr 1fr;gap:12px;}.ows-tlc{flex:1.7 1 auto;}.ows-r4{flex:1.35 1 auto;display:grid;grid-template-columns:1.45fr 1fr;gap:12px;}',
    '.ows-total{justify-content:center;gap:4px;padding:10px 22px;}.ows-tot b{font-size:40px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;}.ows-tot span{font-size:24px;font-weight:500;margin:0 8px 0 5px;opacity:.9;}.ows-totsub{font-size:15px;opacity:.75;}',
    '.ows-score{position:relative;flex-direction:row;align-items:center;gap:18px;padding:10px 18px;}',
    '.ows-scring{position:relative;flex:none;width:86px;height:86px;}.ows-scw{position:absolute;inset:0;}.ows-scw svg{width:100%;height:100%;display:block;overflow:visible;}',
    '.ows-scin{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}.ows-scin b{font-size:22px;font-weight:600;line-height:1;}.ows-scin span{font-size:8.5px;opacity:.75;margin-top:3px;}',
    '.ows-scr{flex:1;min-width:0;}.ows-grade{font-size:21px;font-weight:600;}.ows-delta{display:flex;align-items:center;gap:6px;font-size:13.5px;opacity:.75;margin-top:6px;}',
    '.ows-ib{position:absolute;top:10px;right:10px;display:flex;padding:4px;border:0;background:none;color:inherit;opacity:.75;cursor:pointer;}',
    '.ows-info{position:absolute;inset:0;z-index:2;padding:14px 44px 14px 18px;border-radius:inherit;background:rgba(20,20,26,.92);font-size:13px;line-height:1.4;display:flex;align-items:center;}.ows-info[hidden]{display:none;}',
    '.ows-ch{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600;}.ows-ch>span{display:flex;opacity:.9;}',
    '.ows-stages{justify-content:space-between;gap:10px;padding:12px 18px;}.ows-bar{height:22px;border-radius:11px;}.ows-leg{justify-content:space-between;flex-wrap:nowrap;gap:10px;white-space:nowrap;}',
    '.ows-count{align-items:center;justify-content:space-between;gap:4px;padding:12px 8px;}.ows-count .ows-ch{font-size:13.5px;gap:7px;white-space:nowrap;}.ows-bign{font-size:36px;font-weight:600;line-height:1;margin:auto 0;}',
    '.ows-tlc{gap:4px;padding:12px 18px 8px;}.ows-tlbody{flex:1;display:flex;gap:12px;min-height:66px;}',
    '.ows-lanes{display:flex;flex-direction:column;justify-content:space-around;font-size:12.5px;opacity:.7;flex:none;}',
    '.ows-tl{flex:1;min-width:0;}.ows-tl svg{display:block;width:100%;height:100%;overflow:visible;}',
    '.ows-axis{display:flex;justify-content:space-between;font-size:12.5px;opacity:.75;padding-left:48px;}',
    '.ows-vit{gap:6px;padding:12px 18px;}.ows-gn{color:#5ee08f;}.ows-gs{flex:1;display:flex;justify-content:space-around;align-items:center;}',
    '.ows-g{display:flex;flex-direction:column;align-items:center;gap:6px;}.ows-gr{position:relative;width:62px;height:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;}',
    '.ows-gr>svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}.ows-gi{display:flex;position:relative;}.ows-gi svg{filter:drop-shadow(0 0 5px currentColor);}.ows-gr b{position:relative;font-size:11.5px;font-weight:600;margin-top:1px;}',
    '.ows-gl{font-size:13px;opacity:.75;}',
    '.ows-ins{gap:8px;padding:12px 18px;}.ows-insb{flex:1;display:flex;align-items:center;gap:14px;font-size:15px;line-height:1.4;}.ows-insi{display:flex;flex:none;color:#b49cff;filter:drop-shadow(0 0 6px #9a7bff);}',
    // ---- History = the user's History reference (2026-11-19) ----
    '.osh-head .ows-head{flex:none;padding:0 2px;margin:0;}',
    '.osh-pick{position:absolute;inset:0;opacity:0;pointer-events:none;}',
    '.osh-r3{flex:.95 1 auto;display:grid;grid-template-columns:1.9fr 1fr;gap:12px;}.osh-r4{flex:1.35 1 auto;display:grid;grid-template-columns:1.1fr 1fr;gap:12px;}',
    '.osh-sleep{flex-direction:row;align-items:center;gap:12px;padding:10px 16px;}.osh-sl{flex:none;}.osh-sr{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;}.osh-bar{height:20px;}.osh-leg{font-size:11.5px;gap:8px;justify-content:space-between;flex-wrap:nowrap;white-space:nowrap;}',
    '.osh-big{margin-top:2px;}.osh-big b{font-size:26px;font-weight:600;font-variant-numeric:tabular-nums;}.osh-big span{font-size:15px;margin:0 4px 0 3px;opacity:.85;}',
    '.osh-act{flex-direction:row;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;}.osh-abars{height:46px;}',
    '.osh-week{gap:6px;padding:12px 16px;}.osh-wk{flex:1;display:flex;justify-content:space-between;align-items:stretch;gap:6px;min-height:60px;}',
    '.osh-wkd{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;}.osh-wkd>span{font-size:11.5px;opacity:.75;}',
    '.osh-wkb{flex:1;display:flex;align-items:flex-end;gap:3px;}.osh-wkb i{width:9px;border-radius:3px 3px 2px 2px;}',
    '.osh-wkleg{font-size:11.5px;gap:14px;}',
    // ---- Settings = the user's Settings reference (2026-11-19) ----
    '.osp-head{display:flex;align-items:center;gap:16px;padding:0 4px;}.osp-gear{display:flex;opacity:.9;}.osp-title{font-size:23px;font-weight:700;line-height:1.1;}.osp-sub{font-size:14px;opacity:.7;margin-top:2px;}',
    '.osp-r1{flex:0.95 1 0;display:grid;grid-template-columns:1.1fr 1fr;gap:12px;}.osp-r2{flex:2 1 0;display:grid;grid-template-columns:1fr 1.4fr;gap:12px;}.osp-r3{flex:1.47 1 0;display:grid;grid-template-columns:1.2fr 1fr;gap:12px;}',
    '.osp-sock.owh{margin:0;flex-direction:row;align-items:center;gap:14px;padding:8px 16px;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer;}',
    '.osp-sart{width:76px;height:72px;flex:none;display:flex;justify-content:center;filter:drop-shadow(0 0 10px rgba(var(--owl-c),.45));}.osp-sart svg{height:100%;width:auto;}',
    '.osp-st{flex:1;display:flex;flex-direction:column;gap:3px;}.osp-st b{font-size:17px;font-weight:600;}.osp-st>span{font-size:14px;opacity:.75;}.osp-st .owh-status{opacity:1;margin-top:4px;font-size:13.5px;}',
    '.osp-batt{flex-direction:row;align-items:center;gap:18px;padding:8px 20px;}.osp-bl{flex:none;display:flex;flex-direction:column;gap:6px;}.osp-bt{font-size:15px;font-weight:600;}.osp-bv{font-size:17px;font-weight:600;}.osp-brem{font-size:12.5px;opacity:.7;}',
    '.osp-bbar{flex:1;height:10px;border-radius:5px;background:rgba(255,255,255,.1);overflow:hidden;}.osp-bbar i{display:block;height:100%;border-radius:5px;background:color-mix(in srgb,var(--okie-ok,#34c759) 67%,#fff);box-shadow:0 0 10px color-mix(in srgb,var(--okie-ok,#34c759) 60%,transparent);}.osp-bbar.mid i{background:color-mix(in srgb,var(--okie-warn,#ff9f0a) 63%,#fff);}.osp-bbar.low i{background:color-mix(in srgb,var(--okie-danger,#ff3b30) 69%,#fff);}',
    '.osp-card{gap:4px;padding:9px 14px;}.osp-ch{display:flex;align-items:center;gap:14px;}.osp-ch>span{display:flex;opacity:.9;flex:none;}.osp-ch b{display:block;font-size:16px;font-weight:600;}.osp-ch div>span{display:block;font-size:12.5px;opacity:.7;margin-top:1px;}',
    '.osp-rows{flex:1;display:flex;flex-direction:column;justify-content:space-around;}',
    '.osp-row{display:flex;align-items:center;gap:10px;min-height:31px;border-bottom:1px solid rgba(255,255,255,.07);}.osp-row:last-child{border-bottom:0;}.osp-ri{display:flex;flex:none;opacity:.9;}.osp-rl{flex:1;font-size:13.5px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.osp-row .ios-switch{margin:-3px 0;transform:scale(.74);transform-origin:right center;}.osp-rr{display:flex;align-items:center;gap:10px;}',
    '.osp-pill{position:relative;display:flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);color:inherit;font:inherit;font-size:13px;cursor:pointer;border:0;white-space:nowrap;}.osp-pill>span{display:flex;opacity:.8;pointer-events:none;}',
    '.osp-sel{appearance:none;-webkit-appearance:none;border:0;background:none;color:inherit;font:inherit;font-size:13px;padding:0 2px;cursor:pointer;outline:none;}.osp-sel option{color:#1d1b19;}',
    '.osp-profc{gap:8px;}.osp-prof{flex:1;display:flex;align-items:center;gap:14px;padding:6px 12px;border-radius:16px;border:0;background:rgba(255,255,255,.05);box-shadow:var(--okie-card-edge,none);color:inherit;font:inherit;text-align:left;cursor:pointer;}.osp-prof>span{display:flex;opacity:.8;}',
    '.osp-pt{flex:1;display:flex;flex-direction:column;gap:3px;}.osp-pt b{font-size:17px;font-weight:600;}.osp-pt span{font-size:12.5px;opacity:.7;white-space:nowrap;}',
    '.osp-photo{flex:none;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.1) center/cover no-repeat;color:rgba(255,255,255,.7);}.osp-photo.has{color:transparent;}',
    '.osp-devs{flex:.9 1 auto;flex-direction:row;align-items:center;gap:10px;padding:7px 12px;}.osp-devs>.osp-ch{flex:1;min-width:0;}',
    '.osp-dev{flex:none;width:31%;display:flex;align-items:center;gap:10px;padding:6px 12px;border-radius:16px;border:0;background:rgba(255,255,255,.05);box-shadow:var(--okie-card-edge,none);color:inherit;font:inherit;text-align:left;cursor:pointer;}.osp-dev>span{display:flex;opacity:.8;}',
    '.osp-dart{width:38px;height:38px;flex:none;display:flex;align-items:center;justify-content:center;}.osp-dart svg{max-height:100%;width:auto;}',
    '.osp-dt{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0;}.osp-dt b{font-size:14px;font-weight:600;}.osp-dt span{display:flex;align-items:center;gap:6px;font-size:12px;opacity:.8;}.osp-dt i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.35);}.osp-dt i.on{background:#34c759;box-shadow:0 0 6px rgba(52,199,89,.7);}',
    '.osp-form{display:flex;flex-direction:column;gap:14px;padding:4px 2px 2px;}.osp-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;}.osp-form label>span{opacity:.75;}',
    '.osp-in{padding:10px 14px;border-radius:12px;border:0;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);color:inherit;font:inherit;font-size:15px;color-scheme:dark;}',
    '.osp-save{align-self:flex-end;padding:9px 22px;border-radius:999px;border:0;background:#fff;color:#1d1b19;font:inherit;font-size:15px;font-weight:600;cursor:pointer;}',
    '.osp-picrow{display:flex;align-items:center;gap:16px;}.osp-picb{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}.osp-btn{padding:7px 16px;border-radius:999px;border:0;background:#fff;color:#1d1b19;font:inherit;font-size:14px;font-weight:600;cursor:pointer;}.osp-btn.ghost{background:rgba(255,255,255,.1);color:inherit;}.osp-msg{flex-basis:100%;font-size:12.5px;opacity:.75;}',
    '.owc-head{display:flex;align-items:center;gap:8px;}',
    '.owc-title{font-size:14px;font-weight:700;}',
    '.owc-state{font-size:13px;opacity:.85;}',
    '.owc-batt{font-size:11px;font-weight:600;}',
    '.owc.live .owc-state{color:#30d6c4;}',
    // ---- the app's own brand header (appshell `header` slot) and richer Live/Sleep cards ----
    // the Owlet hero: NO card - no background fill, no border, no border-radius, no box-shadow. It sits
    // directly on the tab body's own surface, exactly like the Comfort Temp card below it is a sibling,
    // not a nested panel. Two plain flex rows: a slim top bar (brand left, battery/more right), then a
    // row with the text on the left and the sock on the right, vertically centered via align-items.
    '.owh{position:relative;padding:2px 4px 0;margin-bottom:14px;}',
    '.owh-topbar{position:relative;z-index:1;}',
    '.owh-topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}',
    '.owh-brand{display:flex;align-items:center;gap:8px;}',
    '.owh-ic{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(48,214,196,.18);color:#30d6c4;}',
    '.owh-ic svg{width:60%;height:60%;}',
    '.owh-brand-t{font-size:15px;font-weight:700;}',
    '.owh-pills{display:flex;align-items:center;gap:8px;}',
    '.owh-pill{display:flex;align-items:center;font-size:15px;font-weight:600;text-shadow:0 1px 8px rgba(0,0,0,.35);}.owh-pill b,.owh-pill .okie-batt{font-weight:600;}',
    // text row: left 43% only; the sock is a sibling spanning the whole hero (see .owh-art-wrap)
    '.owh-row{display:flex;align-items:center;min-height:150px;}',
    '.owh-text{text-align:left;min-width:0;max-width:43%;}',
    '.owh-head{font-size:26px;font-weight:800;letter-spacing:-.01em;line-height:1.1;}',
    '.owh-sub{font-size:14.5px;font-weight:500;opacity:.6;margin-top:3px;}',
    '.owh-status{display:flex;align-items:center;justify-content:flex-start;gap:8px;font-size:13px;font-weight:600;margin-top:10px;}',
    '.owh-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.35);flex:none;}',
    '.owh-dot.on{background:#30d6c4;box-shadow:0 0 6px rgba(48,214,196,.8);}',
    // the sock's column: centers it both horizontally and vertically within its own half, regardless of the text column's height
    '.owh-art-wrap{position:absolute;top:0;bottom:0;left:43%;width:27%;display:grid;place-items:center;pointer-events:none;}',      // 43-70% across, full hero height (header row included), like the reference
    '.owh-art{position:absolute;top:10%;bottom:10%;left:0;right:0;display:flex;justify-content:center;filter:drop-shadow(0 8px 16px rgba(0,0,0,.35)) drop-shadow(0 0 10px rgba(var(--owl-c),.6));animation:owlHaloPx var(--owl-sp) ease-in-out infinite;}',
    '@keyframes owlHaloPx{0%,100%{filter:drop-shadow(0 8px 16px rgba(0,0,0,.35)) drop-shadow(0 0 7px rgba(var(--owl-c),.35));}50%{filter:drop-shadow(0 8px 16px rgba(0,0,0,.35)) drop-shadow(0 0 15px rgba(var(--owl-c),.85));}}',
    '.owh-art svg{width:auto;height:100%;max-width:100%;display:block;}',      // the sock itself fills that box, aspect ratio preserved (the viewBox is already cropped to its own visible bounds, so this centers the actual drawing, not a padded canvas)
    // ---- the status colour (Owlet's base-station light): the dot, the tag and the pulsing light around the sock ----
    '.owh,.owf{--owl-c:94,227,181;--owl-sp:3.2s;}',
    '.owh[data-level="blue"],.owf[data-level="blue"]{--owl-c:90,170,255;}',
    '.owh[data-level="yellow"],.owf[data-level="yellow"]{--owl-c:255,204,64;--owl-sp:2s;}',
    '.owh[data-level="red"],.owf[data-level="red"]{--owl-c:var(--okie-danger-rgb);--owl-sp:1.1s;}',
    '.owh[data-level="idle"],.owf[data-level="idle"],.owh[data-level="off"],.owf[data-level="off"]{--owl-c:150,150,150;}',
    '.owh-glow{position:absolute;left:41%;width:31%;top:8%;bottom:-6%;border-radius:50%;background:radial-gradient(closest-side,rgba(var(--owl-c),.42),rgba(var(--owl-c),.14) 55%,rgba(var(--owl-c),0));pointer-events:none;animation:owlBreath var(--owl-sp) ease-in-out infinite;}',
    '.owh[data-level="idle"] .owh-art,.owh[data-level="off"] .owh-art,.owf[data-level="idle"] .owf-art,.owf[data-level="off"] .owf-art{animation:none;}',
    '.owh[data-level="idle"] .owh-glow,.owh[data-level="off"] .owh-glow,.owf[data-level="idle"] .owf-glow,.owf[data-level="off"] .owf-glow{animation:none;opacity:.25;}',
    '@keyframes owlHalo{0%,100%{filter:drop-shadow(0 4cqh 8cqh rgba(0,0,0,.4)) drop-shadow(0 0 3cqh rgba(var(--owl-c),.35));}50%{filter:drop-shadow(0 4cqh 8cqh rgba(0,0,0,.4)) drop-shadow(0 0 6cqh rgba(var(--owl-c),.85));}}',
    '@keyframes owlBreath{0%,100%{opacity:.55;transform:scale(.92);}50%{opacity:1;transform:scale(1.08);}}',
    '.owh .owh-dot{background:rgb(var(--owl-c));box-shadow:0 0 6px rgba(var(--owl-c),.8);}',
    '.owh-tag{font-style:normal;color:rgb(var(--owl-c));}',
    // (text sizes are cqh times var(--okie-fs): they follow the Text size setting like every px size does; One Motor, 2026-11-19)
    // ---- the favorites card (favCard): the user's reference banner laid out on the TV card's size (.rc: same glass,
    // border, 26px corners, 170px tall like .rc-media). The reference is 352px tall, so 1cqh = 3.52 reference px: every size follows the height. ----
    '.owf{container-type:size;height:170px;min-height:170px;cursor:pointer;color:#fff;}',
    '.owf-glow{position:absolute;left:33%;width:44%;top:6%;height:108%;border-radius:50%;background:radial-gradient(closest-side,rgba(var(--owl-c),.55),rgba(var(--owl-c),.2) 58%,rgba(var(--owl-c),0));pointer-events:none;animation:owlBreath var(--owl-sp) ease-in-out infinite;}',
    '.owf-art{position:absolute;left:44%;width:24%;top:12%;bottom:3%;display:flex;justify-content:center;pointer-events:none;filter:drop-shadow(0 4cqh 8cqh rgba(0,0,0,.4)) drop-shadow(0 0 4.6cqh rgba(var(--owl-c),.6));animation:owlHalo var(--owl-sp) ease-in-out infinite;}',
    '.owf-art svg{height:100%;width:auto;max-width:100%;display:block;}',
    '.owf-brand{position:absolute;left:15.34cqh;top:22.7cqh;transform:translateY(-50%);display:flex;align-items:center;gap:5.4cqh;}',
    '.owf-ic{display:flex;width:19.2cqh;height:19.2cqh;color:rgb(94,227,181);}',
    '.owf-ic svg{width:100%;height:100%;stroke-width:2;}',
    '.owf-brand-t{font-size:calc(13.1cqh*var(--okie-fs,1));font-weight:600;letter-spacing:-.01em;line-height:1;}',
    '.owf-pills{position:absolute;right:12.8cqh;top:26.1cqh;transform:translateY(-50%);display:flex;align-items:center;gap:10.5cqh;}',
    '.owf-pill{display:flex;align-items:center;}',
    '.owf-pill b{font-size:15px;font-weight:600;text-shadow:0 1px 8px rgba(0,0,0,.35);}',
    '.owf-text{position:absolute;left:15.34cqh;top:42.4cqh;width:40%;display:flex;flex-direction:column;align-items:flex-start;}',      // the three lines stack in flow (same gaps as the reference at 100 % text), so a bigger Text size pushes the lines down instead of overlapping
    '.owf-head{white-space:nowrap;font-size:calc(16.6cqh*var(--okie-fs,1));font-weight:500;letter-spacing:-.012em;line-height:1;}',
    '.owf-sub{margin-top:2.1cqh;white-space:nowrap;font-size:calc(8.95cqh*var(--okie-fs,1));font-weight:400;line-height:1;opacity:.62;}',
    '.owf-status{margin-top:9.35cqh;display:flex;align-items:center;gap:3.65cqh;white-space:nowrap;font-size:calc(6.6cqh*var(--okie-fs,1));font-weight:500;line-height:1;}',
    '.owf-dot{width:5.8cqh;height:5.8cqh;border-radius:50%;flex:none;background:rgb(var(--owl-c));box-shadow:0 0 2.65cqh rgba(var(--owl-c),.7);}',
    '.owf-sep{margin:0 4.8cqh;opacity:.7;}',
    '.owf-tag{font-style:normal;color:rgb(var(--owl-c));}',
    '.ow-livepill{margin-left:auto;padding:2px 9px;border-radius:999px;background:rgba(48,214,196,.18);color:#30d6c4;font-size:10.5px;font-weight:700;}',
    '.ow-live-row{display:flex;gap:10px;}',
    '.ow-stat{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:14px 8px;border-radius:14px;background:rgba(255,255,255,.05);}',
    '.ow-stat svg{opacity:.85;}',
    '.ow-stat-v{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;}',
    '.ow-stat-l{font-size:11px;font-weight:600;opacity:.6;}',
    '.ow-pulseline{position:relative;height:28px;margin-top:2px;overflow:hidden;border-radius:8px;background:rgba(255,255,255,.04);}',
    '.ow-pulseline-i{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 14px,rgba(48,214,196,.5) 14px 16px);animation:owPulse 2.2s linear infinite;opacity:.0;}',
    '.ow-livecard.live .ow-pulseline-i{opacity:1;}',
    '@keyframes owPulse{from{transform:translateX(0);}to{transform:translateX(-30px);}}',
    '.ow-sockcard{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:18px;background:var(--okie-tile,rgba(255,255,255,.08));-webkit-backdrop-filter:var(--okie-card-bf,none);backdrop-filter:var(--okie-card-bf,none);border:0;box-shadow:var(--okie-card-edge,none);}',
    '.ow-sock-ic{flex:none;opacity:.85;}',
    '.ow-sock-sub{display:flex;align-items:center;gap:6px;font-size:12px;opacity:.75;margin-top:2px;}',
    '.ow-sleep-state{font-size:30px;font-weight:700;margin:2px 0 4px;}',
    '.ow-segbar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:rgba(255,255,255,.08);}',
    '.ow-seg{height:100%;}',
    '.ow-seglegend{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;font-weight:600;opacity:.8;}',
    '.ow-segitem{display:flex;align-items:center;gap:5px;}',
    '.ow-segitem i{width:8px;height:8px;border-radius:50%;flex:none;}',
    '.ow-settings-link{align-self:flex-start;padding:10px 14px;border-radius:12px;background:rgba(255,255,255,.08);border:0;color:#fff;font-size:13px;font-weight:600;cursor:pointer;}',
    // ---- a phone (2026-11-19, the user's choice): every Owlet page is one column you scroll down; the iPad keeps its layout
    '@media (max-width:700px){',
    '.owd{gap:12px;min-height:0;}',
    '.owd>div,.owd>section,.owd>button{flex:0 0 auto;}',
    '.owd-row2,.owd-row3,.ows-r1,.ows-r4,.osh-r3,.osh-r4,.osp-r1,.osp-r2,.osp-r3{grid-template-columns:minmax(0,1fr);}',
    '.owl-row3{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}',
    '.owl-small{padding:12px 10px;}.owl-stop{flex-direction:column;align-items:center;gap:6px;text-align:center;}.owl-sic svg{width:30px;height:30px;}',
    '.owd-vital,.owl-big{min-height:150px;}.owl-btop{justify-content:flex-start;}.owl-bic svg{width:56px;height:56px;}',
    '.owl-head{flex-direction:column;align-items:stretch;}.owl-sock{min-width:0;}',
    '.owl-strip{flex-wrap:wrap;gap:10px 14px;}.owl-strip .owl-sep{display:none;}.owl-strip .owl-stbar{flex-basis:100%;}',
    '.ows-r2{grid-template-columns:minmax(0,1fr) minmax(0,1fr);}.ows-r2>:first-child{grid-column:1/-1;}',
    '.osh-head{flex-wrap:wrap;}.osh-head .osh-strip{flex-basis:100%;order:2;}.osh-head .osh-seg{margin-left:auto;}',
    ':is(.ow-page,.hx-card).osh-chart{flex-direction:column;}.osh-cl{width:auto;}.osh-cr{min-height:120px;}.osh-chart .osh-y{display:none;}.osh-x span:nth-child(even){display:none;}',
    '.osh-sleep{flex-direction:column;align-items:stretch;}',
    '.osp-devs{flex-direction:column;align-items:stretch;}.osp-dev{width:auto;}',
    '.osp-sock.owh,.osp-batt{min-height:96px;}',
    '}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  /** babyCam(ctx) -> the baby's camera id (the Kindle's baby monitor view opens it full screen). */
  function babyCam(ctx) { var cfg = sockOnlyConfig(ctx); if (!cfg) return null; var ids = sockIds(cfg); return ids ? owletCam(ctx, cfg, ids) : null; }
  g.OkieMotor.owlet = { babyCam: babyCam, camScreen: camScreen, openTab: openOwletTab, vitalsFor: vitalsFor, configFor: configFor, panel: panel, liveBadge: liveBadge, reconcileRecording: reconcileRecording, buildCard: buildCard, favCard: favCard, owns: owns, fold: fold, sockStatus: sockStatus };
})(typeof globalThis !== 'undefined' ? globalThis : window);
