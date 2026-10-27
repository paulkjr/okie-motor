/* Mock Home Assistant `hass` for the browser harness. Not shipped. */
(function (g) {
  'use strict';
  function ent(id, name, state, attrs, reg) { return { id: id, st: { entity_id: id, state: state, attributes: Object.assign({ friendly_name: name }, attrs || {}), last_changed: new Date().toISOString(), last_updated: new Date().toISOString() }, reg: reg || {} }; }
  var A = function (id, name) { return { area_id: id, _n: name }; };
  var list = [
    ent('fan.anziehraum_klima', 'Anziehraum Klima Climate', 'off', {}, { area_id: 'anziehraum' }),
    ent('light.anziehraum_deckenleuchte', 'Anziehraum Deckenleuchte', 'off', { brightness: 0 }, { area_id: 'anziehraum' }),
    ent('cover.anziehraum_rollade', 'Anziehraum Rollade', 'open', { current_position: 100 }, { area_id: 'anziehraum' }),
    ent('binary_sensor.anziehraum_smoke', 'Anziehraum Smoke Sensor 9', 'off', { device_class: 'smoke' }, { area_id: 'anziehraum' }),
    ent('sensor.anziehraum_temp', 'Anziehraum Temperatur', '21.5', { device_class: 'temperature', unit_of_measurement: '°C' }, { area_id: 'anziehraum' }),
    ent('sensor.anziehraum_hum', 'Anziehraum Feuchte', '62', { device_class: 'humidity', unit_of_measurement: '%' }, { area_id: 'anziehraum' }),
    ent('light.arbeitszimmer_decke', 'Arbeitszimmer Decke', 'off', {}, { area_id: 'arbeitszimmer' }),
    ent('fan.arbeitszimmer_klima', 'Arbeitszimmer Klima Climate', 'off', {}, { area_id: 'arbeitszimmer' }),
    ent('cover.arbeitszimmer_rollade', 'Arbeitszimmer Rollade', 'open', { current_position: 100 }, { area_id: 'arbeitszimmer' }),
    ent('binary_sensor.arbeitszimmer_smoke', 'Arbeitszimmer Smoke Sensor 10', 'off', { device_class: 'smoke' }, { area_id: 'arbeitszimmer' }),
    ent('sensor.arbeitszimmer_temp', 'Arbeitszimmer Temperatur', '22.0', { device_class: 'temperature', unit_of_measurement: '°C' }, { area_id: 'arbeitszimmer' }),
    ent('sensor.arbeitszimmer_hum', 'Arbeitszimmer Feuchte', '62', { device_class: 'humidity', unit_of_measurement: '%' }, { area_id: 'arbeitszimmer' }),
    ent('light.kitchen_ceiling', 'Kitchen Ceiling', 'on', { brightness: 180, supported_color_modes: ['color_temp', 'xy'], color_temp_kelvin: 2700 }, { area_id: 'kitchen' }),
    ent('light.kitchen_counter', 'Kitchen Counter', 'off', {}, { area_id: 'kitchen' }),
    ent('switch.coffee_machine', 'Kitchen Coffee Machine', 'off', {}, { area_id: 'kitchen' }),
    ent('media_player.kitchen_speaker', 'Kitchen Speaker', 'idle', { device_class: 'speaker' }, { area_id: 'kitchen' }),
    ent('light.living_room_lamp', 'Living Room Lamp', 'on', { brightness: 90, supported_color_modes: ['brightness'] }, { area_id: 'living_room' }),
    ent('light.living_room_strip', 'Living Room LED Strip', 'off', {}, { area_id: 'living_room' }),
    ent('climate.living_room', 'Living Room Thermostat', 'heat', { current_temperature: 21.5, temperature: 22, hvac_modes: ['off', 'heat', 'cool', 'auto', 'heat_cool'], preset_modes: ['none', 'eco'], preset_mode: 'none', min_temp: 16, max_temp: 30, target_temp_step: 0.5 }, { area_id: 'living_room' }),
    ent('cover.living_room_blinds', 'Living Room Blinds', 'open', { current_position: 40 }, { area_id: 'living_room' }),
    ent('media_player.living_room_tv', 'Living Room TV', 'playing', { media_title: 'Planet Earth', volume_level: 0.4, device_class: 'tv', source_list: ['TV', 'HDMI', 'Netflix', 'Disney Plus', 'Apple TV', 'Max'], supported_features: 152461 }, { area_id: 'living_room' }),
    ent('remote.living_room_tv', 'Living Room TV', 'on', {}, {}),
    ent('vacuum.robo', 'Robo Vacuum', 'docked', { favorites: [{ id: 'f1', name: 'Vacuum and Mop Everywhere' }, { id: 'f2', name: 'Around Litter box' }, { id: 'f3', name: 'Vacuum Everywhere' }], supported_features: 13084, bin_full: false, bin_present: true, detected_pad: 'reusableWet', tank_level: 70, tank_present: true }, { area_id: 'living_room', device_id: 'dev_robo', platform: 'roomba_plus' }),
    ent('script.feed_the_beasts_2', 'Feed The Beasts', 'off', { last_triggered: new Date(Date.now() - 3 * 3600e3).toISOString() }, {}),
    ent('script.govee_cozy_lights', 'Govee shortcut: Cozy lights', 'off', { icon: 'mdi:sofa' }, {}),
    ent('script.govee_lets_go_to_sleep', "Govee shortcut: Let's go to sleep", 'off', { icon: 'mdi:weather-night' }, {}),
    ent('script.govee_turn_up_the_lights', 'Govee shortcut: Turn up the lights', 'off', { icon: 'mdi:lightbulb-on' }, {}),
    ent('scene.movie_night', 'Movie night', 'unknown', {}, {}),
    ent('select.robo_cleaning_mode', 'Robo Vacuum Cleaning mode', 'vacuum', { options: ['vacuum', 'mop', 'vacuum_and_mop', 'vacuum_then_mop'] }, { entity_category: 'config' }),
    ent('select.robo_zone', 'Robo Vacuum Select zone (cloud)', 'Bedroom', { options: ['Bedroom', 'Living Room', 'Kitchen ', 'Cat Litter'], region_icons: { Bedroom: 'mdi:bed-king', 'Living Room': 'mdi:sofa' }, region_areas_m2: { Bedroom: 8.9, 'Living Room': 22.1 }, is_active_map: true, pmap_id: 'x1E' }, { entity_category: 'config' }),
    ent('select.robo_cleaning_passes', 'Robo Vacuum Setting – Cleaning passes', 'One pass', { options: ['Auto', 'One pass', 'Two passes'] }, { entity_category: 'config' }),
    ent('select.robo_reusable_pad_wetness', 'Robo Vacuum Reusable pad wetness', '2', { options: ['1', '2', '3'] }, { entity_category: 'config' }),
    ent('switch.robo_edge_clean', 'Robo Vacuum Setting – Edge clean', 'on', {}, { entity_category: 'config' }),
    ent('switch.robo_child_lock', 'Robo Vacuum Setting – Child lock', 'off', {}, { entity_category: 'config' }),
    ent('button.robo_clean_smart_zone', 'Robo Vacuum Clean zone (Smart Map)', 'unknown', {}, { entity_category: 'config' }),
    ent('button.robo_fav_f1', 'Robo Vacuum Vacuum and Mop Everywhere', 'unknown', {}, { entity_category: 'config' }),
    ent('button.robo_reset_filter', 'Robo Vacuum Reset filter', 'unknown', {}, { entity_category: 'config' }),
    ent('button.robo_reset_brush', 'Robo Vacuum Reset brush', 'unknown', {}, { entity_category: 'config' }),
    ent('sensor.robo_filter_remaining_hours', 'Robo Vacuum Maintenance – Filter', '0', { threshold_hours: 52, max_hours: 53, unit_of_measurement: 'h' }, { entity_category: 'diagnostic' }),
    ent('sensor.robo_brush_remaining_hours', 'Robo Vacuum Maintenance – Brushes', '259', { threshold_hours: 312, max_hours: 312, unit_of_measurement: 'h' }, { entity_category: 'diagnostic' }),
    ent('binary_sensor.robo_maintenance_due', 'Robo Vacuum Maintenance due', 'on', { due: ['filter'] }, { entity_category: 'diagnostic' }),
    ent('image.robo_map', 'Robo Vacuum Cleaning path', '2026-10-11T23:29:01+00:00', { entity_picture: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#2d3a36"/><rect x="30" y="30" width="110" height="140" fill="#46605a"/><rect x="150" y="30" width="120" height="70" fill="#566f68"/><path d="M50 150 L120 60 L190 80 L240 60" stroke="#8fe3a8" stroke-width="3" fill="none"/></svg>') }, { entity_category: 'diagnostic' }),
    ent('image.robo_rooms_map', 'Robo Vacuum Rooms map', '2026-10-11T23:29:01+00:00', { entity_picture: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="#33323a"/><rect x="20" y="20" width="120" height="160" fill="#5b567a"/></svg>') }, { entity_category: 'diagnostic' }),
    ent('sensor.robo_battery', 'Robo Vacuum Battery', '100', { device_class: 'battery', unit_of_measurement: '%' }, { entity_category: 'diagnostic' }),
    ent('binary_sensor.robo_charging', 'Robo Vacuum Charging', 'on', { device_class: 'battery_charging' }, { entity_category: 'diagnostic' }),
    ent('sensor.robo_total_missions', 'Robo Vacuum Total missions', '420', { unit_of_measurement: 'Missions' }, { entity_category: 'diagnostic' }),
    ent('sensor.robo_successful_missions', 'Robo Vacuum Successful missions', '273', { unit_of_measurement: 'Missions' }, { entity_category: 'diagnostic' }),
    ent('sensor.robo_canceled_missions', 'Robo Vacuum Canceled missions', '66', { unit_of_measurement: 'Missions' }, { entity_category: 'diagnostic' }),
    ent('sensor.robo_failed_missions', 'Robo Vacuum Failed missions', '80', { unit_of_measurement: 'Missions' }, { entity_category: 'diagnostic' }),
    ent('sensor.robo_scrubs', 'Robo Vacuum Scrubs', '9', { unit_of_measurement: 'Scrubs' }, { entity_category: 'diagnostic' }),
    ent('sensor.robo_average_mission_time', 'Robo Vacuum Average mission time', '419', { unit_of_measurement: 'min' }, { entity_category: 'diagnostic' }),
    ent('sensor.robo_last_mission_start_time', 'Robo Vacuum Last mission start time', new Date(Date.now() - 95 * 60000).toISOString(), { device_class: 'timestamp' }, { entity_category: 'diagnostic' }),
    ent('lock.front_door', 'Front Door Lock', 'locked', {}, { area_id: 'hallway' }),
    ent('camera.front_door', 'Front Door Camera', 'idle', { entity_picture: 'assets/room.jpg' }, { area_id: 'hallway' }),
    ent('camera.patio_live_view', 'Patio Camera', 'idle', { entity_picture: 'assets/room.jpg' }, { area_id: 'garden' }),
    ent('binary_sensor.patio_motion', 'Patio Motion', 'on', { device_class: 'motion' }, { area_id: 'garden' }),
    ent('event.patio_motion', 'Patio Motion Event', new Date(Date.now() - 35 * 60000).toISOString(), { device_class: 'motion', event_type: 'motion' }, { area_id: 'garden' }),
    ent('event.patio_ding', 'Patio Doorbell Event', new Date(Date.now() - 4 * 3600000).toISOString(), { device_class: 'doorbell', event_type: 'ring' }, { area_id: 'garden' }),
    ent('conversation.home_assistant', 'Home Assistant', 'unknown', {}, {}),
    ent('conversation.claude_conversation', 'Claude conversation', 'unknown', {}, {}),
    ent('image.patio_last_motion', 'Patio last motion', new Date(Date.now() - 35 * 60000).toISOString(), { entity_picture: 'assets/room.jpg', kind: 'motion' }, {}),
    ent('binary_sensor.hallway_motion', 'Hallway Motion', 'off', { device_class: 'motion' }, { area_id: 'hallway' }),
    ent('binary_sensor.kitchen_window', 'Kitchen Window', 'on', { device_class: 'window' }, { area_id: 'kitchen' }),
    ent('climate.bedroom', 'Bedroom Thermostat', 'off', { current_temperature: 19, temperature: 20, hvac_modes: ['off', 'heat', 'cool', 'auto'], min_temp: 16, max_temp: 30, target_temp_step: 0.5 }, { area_id: 'bedroom' }),
    ent('climate.office', 'Office AC', 'heat_cool', { current_temperature: 22, temperature: null, target_temp_low: 20, target_temp_high: 24, hvac_modes: ['off', 'heat_cool', 'heat', 'cool'], min_temp: 16, max_temp: 30, target_temp_step: 0.5 }, { area_id: 'arbeitszimmer' }),
    ent('light.bedroom_main', 'Bedroom Light', 'off', {}, { area_id: 'bedroom' }),
    ent('fan.bedroom_fan', 'Bedroom Fan', 'off', { percentage: 0 }, { area_id: 'bedroom' }),
    ent('garage_dummy.skip', 'skip', 'off', {}, {}),
    ent('cover.garage_door', 'Garage Door', 'closed', { device_class: 'garage' }, { area_id: 'garage' }),
    ent('switch.garden_pump', 'Garden Pump', 'off', {}, { area_id: 'garden' }),
    ent('sensor.kitchen_temperature', 'Kitchen Temperature', '21.0', { device_class: 'temperature', unit_of_measurement: '°C' }, { area_id: 'kitchen' }),
    ent('scene.movie_night', 'Movie Night', 'scening', {}, {}),
    ent('script.goodnight', 'Goodnight', 'off', {}, {}),
    ent('automation.sunset_lights', 'Sunset Lights', 'on', {}, {}),
    ent('weather.home', 'Home', (new URLSearchParams(location.search).get('night') === '1' ? 'clear-night' : 'partlycloudy'), { temperature: 17, humidity: 71, apparent_temperature: 16, wind_speed: 14, wind_speed_unit: 'km/h', wind_bearing: 300, wind_gust_speed: 26, pressure: 1014, pressure_unit: 'hPa', visibility: 16, visibility_unit: 'km', dew_point: 11, uv_index: 3, cloud_coverage: 58, temperature_unit: '°C', forecast: [] }, {}),
    ent('weather.berlin', 'Forecast Berlin', 'rainy', { temperature: 11, humidity: 83, wind_speed: 20, wind_speed_unit: 'km/h', wind_bearing: 240, forecast: [] }, {}),
    ent('sun.sun', 'Sun', (new URLSearchParams(location.search).get('night') === '1' ? 'below_horizon' : 'above_horizon'), { next_rising: new Date(Date.now() + 8 * 3600e3).toISOString(), next_setting: new Date(Date.now() + 5 * 3600e3).toISOString() }, {}),
    ent('sensor.tagesschau', 'Tagesschau', '4', { channel: { title: 'tagesschau.de' }, entries: [
      { id: 't1', title: 'Neue Regeln für Balkonkraftwerke beschlossen', link: 'https://example.com/t1', published: new Date(Date.now() - 3600000).toISOString() },
      { id: 't2', title: 'Wetterdienst warnt vor Sturmböen im Norden', link: 'https://example.com/t2', published: new Date(Date.now() - 2 * 3600000).toISOString() },
      { id: 't3', title: 'Bahn will Takt im Fernverkehr verdichten', link: 'https://example.com/t3', published: new Date(Date.now() - 5 * 3600000).toISOString() },
      { id: 't4', title: 'Forscher entdecken neue Tiefseeart', link: 'https://example.com/t4', published: new Date(Date.now() - 9 * 3600000).toISOString() }] }, {}),
    ent('sensor.heise', 'heise online', '2', { channel: { title: 'heise online' }, entries: [
      { id: 'h1', title: 'Home Assistant 2026.10 bringt neue Dashboards', link: 'https://example.com/h1', published: new Date(Date.now() - 1800000).toISOString() },
      { id: 'h2', title: 'Matter 2.0: Das ändert sich für Smart-Home-Geräte', link: 'https://example.com/h2', published: new Date(Date.now() - 4 * 3600000).toISOString() }] }, {}),
    ent('sensor.house_power', 'House Power', '412', { unit_of_measurement: 'W', device_class: 'power' }, {}),
    // the Kindle Fire and the AWTRIX display: dozens of entities that the app folds into one tile each
    ent('switch.kindle_fire_screen', 'Kindle Fire Screen', 'on', {}, { area_id: 'hallway' }),
    ent('switch.kindle_fire_cycle_screens', 'Kindle Fire Cycle screens', 'on', {}, {}),
    ent('switch.kindle_fire_battery_care', 'Kindle Fire Battery care', 'on', {}, {}),
    ent('number.kindle_fire_brightness', 'Kindle Fire Brightness', '150', { min: 0, max: 255 }, {}),
    ent('number.kindle_fire_volume', 'Kindle Fire Volume', '15', { min: 0, max: 15 }, {}),
    ent('select.kindle_fire_full_screen_card', 'Kindle Fire Full screen card', 'Rotate', { options: ['Dashboard', 'Slideshow', 'Patio cam', 'Weather', 'Quote', 'Rotate'] }, {}),
    ent('text.kindle_fire_screen_message', 'Kindle Fire Screen message', '', { min: 0, max: 200 }, {}),
    ent('text.kindle_fire_photos_sign_in', 'Kindle Fire Photos sign-in', 'unknown', { min: 16, max: 64 }, {}),
    ent('button.kindle_fire_refresh_cards', 'Kindle Fire Refresh cards', 'unknown', {}, {}),
    ent('button.kindle_fire_play_chime', 'Kindle Fire Play chime', 'unknown', {}, {}),
    ent('sensor.kindle_fire_battery', 'Kindle Fire Battery', '51', { unit_of_measurement: '%', device_class: 'battery' }, {}),
    ent('sensor.kindle_fire_showing_on_the_kindle', 'Kindle Fire Showing on the Kindle', 'Weather', {}, {}),
    ent('sensor.kindle_fire_uptime', 'Kindle Fire Uptime', '1708939', { unit_of_measurement: 's', device_class: 'duration' }, {}),
    ent('image.kindle_fire_screen_preview', 'Kindle Fire Screen preview', '2026-10-12T16:12:05', { entity_picture: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect width='320' height='200' fill='%23f4f3ef'/%3E%3Ctext x='20' y='110' font-size='60'%3E81%C2%B0%3C/text%3E%3C/svg%3E" }, {}),
    ent('light.awtrix_2c2c5c_matrix', 'awtrix_2c2c5c Matrix', 'on', {}, { area_id: 'bedroom' }),
    ent('select.awtrix_2c2c5c_transition_effect', 'awtrix_2c2c5c Transition effect', 'Fade', { options: ['Random', 'Slide', 'Dim', 'Zoom', 'Rotate', 'Pixelate', 'Curtain', 'Ripple', 'Blink', 'Reload', 'Fade'] }, {}),
    ent('input_text.awtrix_message', 'AWTRIX Message', '', { min: 0, max: 100 }, {}),
    ent('input_select.awtrix_color', 'AWTRIX Color', 'Rainbow', { options: ['Rainbow', 'Red', 'Orange', 'Yellow', 'Green'] }, {}),
    ent('script.send_awtrix_message', 'Send AWTRIX Message', 'off', {}, {}),
    ent('sensor.awtrix_2c2c5c_battery', 'awtrix_2c2c5c Battery', '100', { unit_of_measurement: '%', device_class: 'battery' }, {}),
    ent('sensor.awtrix_2c2c5c_current_app', 'awtrix_2c2c5c Current app', 'jeef_weather', {}, {}),
    ent('image.awtrix_live_view', 'AWTRIX Live View', '2026-10-12T16:16:18', { entity_picture: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='200'%3E%3Crect width='320' height='200' fill='%23f4f3ef'/%3E%3Ctext x='20' y='110' font-size='60'%3E81%C2%B0%3C/text%3E%3C/svg%3E" }, {}),
    // the sensors of the homelab energy service and the TECO add-on (what the Home Energy card of the Overview reads)
    ent('sensor.energy_server_power', 'Energy Server Power', '12.4', { unit_of_measurement: 'W', device_class: 'power', kwh_today: 0.106, cost_per_day: 0.051, cost_per_month: 1.52, cost_per_year: 19.0, price_cents: 16.31, price_source: 'bill', cpu_package_w: 3.45, dram_w: 0.56, assumed_rest_of_system_w: 8.0, system: { uptime_s: 1183546, mem_used_pct: 73, mem_total_gb: 15.5, disk_used_gb: 110, disk_total_gb: 249, load1: 0.15, temp_c: 35 } }, {}),
    ent('sensor.energy_server_energy_today', 'Energy Server Energy Today', '0.106', { unit_of_measurement: 'kWh', device_class: 'energy' }, {}),
    ent('sensor.energy_server_cost_month', 'Energy Server Cost Month', '1.52', { unit_of_measurement: 'USD' }, {}),
    ent('sensor.energy_home_average_power', 'Energy Home Average Power', '1743', { unit_of_measurement: 'W', device_class: 'power', kwh_per_day: 41.8 }, {}),
    ent('sensor.energy_last_bill', 'Energy Last Bill', '190.71', { unit_of_measurement: 'USD', period_start: '2026-08-07', period_end: '2026-09-04', days: 29, kwh: 1213.0, total: 190.71, marginal_cents: 16.31, history: [
      { period_end: '2026-04-08', kwh: 1010, total: 160.2, days: 30 }, { period_end: '2026-05-08', kwh: 1105, total: 175.3, days: 30 }, { period_end: '2026-06-08', kwh: 1290, total: 205.5, days: 31 }, { period_end: '2026-07-08', kwh: 1344, total: 240.04, days: 30 }, { period_end: '2026-08-06', kwh: 1203, total: 189.09, days: 29 }, { period_end: '2026-09-04', kwh: 1213, total: 190.71, days: 29 }].reverse() }, {}),
    ent('sensor.energy_devices', 'Energy Devices', '4', { devices: [
      { entity: 'light.living_room_lamp', name: 'Living room lamp', watts: 11.5, kind: 'light', lamp: true }, { entity: 'light.kitchen_ceiling', name: 'Kitchen ceiling', watts: 14, kind: 'light', lamp: true },
      { entity: 'light.kitchen_counter', name: 'Kitchen counter', watts: 9, kind: 'light', lamp: true }, { entity: 'switch.garden_pump', name: 'Garden pump', watts: 40, kind: 'plug', lamp: false }] }, {}),
    ent('sensor.energy_containers', 'Energy Containers', '3', { containers: [{ name: 'adguardhome', state: 'running', status: 'Up 13 days' }, { name: 'nextcloud', state: 'running', status: 'Up 13 days' }, { name: 'backup-job', state: 'exited', status: 'Exited (0) 2 hours ago' }], total: 3 }, {}),
    ent('sensor.teco_last_bill_cost', 'TECO Last Bill Cost', '190.71', { unit_of_measurement: 'USD' }, {}),
    ent('sensor.teco_last_bill_usage', 'TECO Last Bill Usage', '1213.0', { unit_of_measurement: 'kWh' }, {}),
    ent('sensor.teco_service_days', 'TECO Service Days', '29', { unit_of_measurement: 'd' }, {}),
    ent('sensor.teco_last_bill_rate', 'TECO Last Bill Rate', '0.15722', { unit_of_measurement: 'USD/kWh' }, {}),
    ent('sensor.teco_service_period_start', 'TECO Service Period Start', '2026-08-07', { device_class: 'date' }, {}),
    ent('sensor.teco_service_period_end', 'TECO Service Period End', '2026-09-04', { device_class: 'date' }, {}),
    ent('sensor.sensor_linkquality', 'Zigbee Linkquality', '120', {}, { area_id: 'hallway' }),
    ent('switch.schedule_a1b2c3', 'Schedule Kitchen light on', 'on', { name: 'Kitchen light 18:30', entities: ['light.kitchen_ceiling'], weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'], timeslots: ['18:30:00'], next_trigger: new Date(Date.now() + 5 * 3600e3).toISOString() }, {}),
    ent('sensor.window_battery', 'Window Sensor Battery', '9', { device_class: 'battery', unit_of_measurement: '%' }, { area_id: 'kitchen' }),
    ent('binary_sensor.hall_smoke', 'Hallway Smoke Detector', 'off', { device_class: 'smoke' }, { area_id: 'hallway' }),
    ent('timer.pasta', 'Pasta', 'active', { remaining: '0:08:30', finishes_at: new Date(Date.now() + 510e3).toISOString() }, {}),
    ent('person.alex', 'Alex', 'home', {}, {}),
    ent('todo.shopping', 'Einkaufsliste', '1', {}, {}),
    ent('todo.tasks', 'To-do', '5', {}, {}),
    ent('event.robo_mission_completed', 'Robo Vacuum Mission completed', new Date(Date.now() - 3 * 3600e3).toISOString(), { event_type: 'mission_completed', entry_id: 'E_ROBO' }, { device_id: 'dev_robo', platform: 'roomba_plus' }),
    ent('sensor.robo_last_mission_summary', 'Robo Vacuum Last mission summary', 'completed', { result: 'completed', duration_min: 27, area_sqft: 358, started_at: new Date(Date.now() - 4 * 3600e3).toISOString(), ended_at: new Date(Date.now() - 3.5 * 3600e3).toISOString() }, { device_id: 'dev_robo', platform: 'roomba_plus' }),
    ent('sensor.robo_room_cleaning_history', 'Robo Vacuum Room cleaning history', '1', { rooms: { Bedroom: new Date(Date.now() - 3.5 * 3600e3).toISOString() } }, { device_id: 'dev_robo', platform: 'roomba_plus' }),
    ent('calendar.robo_schedule', 'Robo Schedule', 'off', { supported_features: 7 }, { device_id: 'dev_robo', platform: 'roomba_plus' }),
    ent('sensor.system_monitor_processor_use', 'System Monitor Processor use', '8', { unit_of_measurement: '%' }, {}),
    ent('sensor.system_monitor_processor_temperature', 'System Monitor Processor temperature', '96.8', { unit_of_measurement: '°F', device_class: 'temperature' }, {}),
    ent('sensor.system_monitor_memory_usage', 'System Monitor Memory usage', '78.2', { unit_of_measurement: '%' }, {}),
    ent('sensor.system_monitor_memory_use', 'System Monitor Memory use', '12400.5', { unit_of_measurement: 'MiB', device_class: 'data_size' }, {}),
    ent('sensor.system_monitor_memory_free', 'System Monitor Memory free', '3456.3', { unit_of_measurement: 'MiB', device_class: 'data_size' }, {}),
    ent('sensor.system_monitor_disk_usage', 'System Monitor Disk usage /', '41.3', { unit_of_measurement: '%' }, {}),
    ent('sensor.system_monitor_disk_use', 'System Monitor Disk use /', '90.9', { unit_of_measurement: 'GiB', device_class: 'data_size' }, {}),
    ent('sensor.system_monitor_disk_free', 'System Monitor Disk free /', '129.4', { unit_of_measurement: 'GiB', device_class: 'data_size' }, {}),
    ent('sensor.system_monitor_uptime', 'System Monitor Uptime', new Date(Date.now() - 16 * 86400e3).toISOString(), { device_class: 'timestamp' }, {}),
    ent('sensor.system_monitor_network_throughput_in_enp0s31f6', 'System Monitor Network throughput in enp0s31f6', '0.42', { unit_of_measurement: 'MB/s', device_class: 'data_rate' }, {}),
    ent('sensor.system_monitor_network_throughput_out_enp0s31f6', 'System Monitor Network throughput out enp0s31f6', '0.013', { unit_of_measurement: 'MB/s', device_class: 'data_rate' }, {}),
    ent('sensor.system_monitor_network_throughput_in_docker0', 'System Monitor Network throughput in docker0', '0', { unit_of_measurement: 'MB/s', device_class: 'data_rate' }, {}),
    ent('sensor.system_monitor_network_throughput_out_docker0', 'System Monitor Network throughput out docker0', '0', { unit_of_measurement: 'MB/s', device_class: 'data_rate' }, {}),
    ent('binary_sensor.eero_wan_status', 'eero WAN status', 'on', { device_class: 'connectivity' }, {}),
    ent('sensor.eero_external_ip', 'eero External IP', '68.200.198.47', {}, {}),
    ent('sensor.backup_last_successful_automatic_backup', 'Backup Last successful automatic backup', new Date(Date.now() - 9 * 3600e3).toISOString(), { device_class: 'timestamp' }, {}),
    ent('sensor.backup_next_scheduled_automatic_backup', 'Backup Next scheduled automatic backup', new Date(Date.now() + 15 * 3600e3).toISOString(), { device_class: 'timestamp' }, {}),
    ent('sensor.backup_backup_manager_state', 'Backup Backup Manager state', 'idle', {}, {}),
    ent('update.hass_n8n_update', 'n8n Update', 'on', { installed_version: '1.2.0', latest_version: '1.3.1' }, {}),
    ent('update.home_assistant_core_update', 'Home Assistant Core Update', 'on', { installed_version: '2026.10.0', latest_version: '2026.10.2' }, {}),
    ent('update.jellyfin_update', 'Jellyfin Update', 'off', { installed_version: '10.9', latest_version: '10.9' }, {}),
    ent('media_player.spotify_alex', 'Spotify Alex', 'playing', { media_title: 'Chapter Test', media_artist: 'Test Band', media_album_name: 'Waking the Test', media_duration: 337, media_position: 4, media_position_updated_at: new Date().toISOString(), media_content_type: 'music', app_name: 'Spotify', volume_level: 0.5, is_volume_muted: false, shuffle: false, repeat: 'off', source: 'iPhone', source_list: ['iPhone', 'iPad', 'Living Room TV'], supported_features: 1 + 2 + 4 + 16 + 32 + 512 + 2048 + 16384 + 32768 + 131072 + 262144, entity_picture: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#2a1f3d"/><circle cx="150" cy="150" r="110" fill="#7a4cc9"/><circle cx="150" cy="150" r="40" fill="#f2c14e"/></svg>') }, {}),
    ent('calendar.work', 'Work', 'off', { supported_features: 0 }, {}),
    ent('calendar.birthdays', 'Birthdays', 'off', { supported_features: 0 }, {}),
    ent('calendar.family', 'Familie', 'off', { supported_features: 7, message: 'Dinner', start_time: new Date(Date.now() + 3600e3).toISOString().slice(0, 19).replace('T', ' '), end_time: new Date(Date.now() + 7200e3).toISOString().slice(0, 19).replace('T', ' ') }, {}),
  ].filter(function (e) { return e.id !== 'garage_dummy.skip'; });
  var areas = {};
  [['anziehraum', 'Anziehraum'], ['arbeitszimmer', 'Arbeitszimmer'], ['kitchen', 'Kitchen'], ['living_room', 'Living Room'], ['hallway', 'Hallway'], ['bedroom', 'Bedroom'], ['garage', 'Garage'], ['garden', 'Garden']].forEach(function (a) { areas[a[0]] = { area_id: a[0], name: a[1] }; });

  function makeHass(onChange) {
    var states = {}, entities = {};
    list.forEach(function (e) { states[e.id] = e.st; entities[e.id] = Object.assign({ entity_id: e.id }, e.reg); });
    var hass = {
      states: states, entities: entities, areas: areas, devices: {},
      language: 'en', locale: { language: 'en' }, config: { unit_system: { temperature: '°C' }, time_zone: 'Europe/Berlin' },
      user: { name: 'Alex', is_admin: true },
      formatEntityState: function (st) { var m = { partlycloudy: g.__lang === 'de' ? 'Teilweise bewölkt' : 'Partly cloudy', sunny: g.__lang === 'de' ? 'Sonnig' : 'Sunny' }; return m[st.state] || st.state; },
      services: { scheduler: { add: {}, remove: {}, edit: {} } },
      connection: { subscribeMessage: function (cb) {
        setTimeout(function () { cb({ type: 'current', notifications: { n1: { notification_id: 'n1', title: 'Backup failed', message: 'The nightly backup could not finish.', created_at: new Date(Date.now() - 3600e3).toISOString(), status: 'unread' }, n2: { notification_id: 'n2', title: '', message: 'Welcome home, Alex', created_at: new Date(Date.now() - 600e3).toISOString(), status: 'unread' } } }); }, 80);
        return Promise.resolve(function () {});
      } },
      callService: function (domain, service, data) {
        if (domain === 'media_player' && /^(media_seek|volume_set|shuffle_set|repeat_set|select_source|media_next_track|media_previous_track|media_pause|media_play|play_media)$/.test(service) && /spotify/.test(String(data.entity_id))) {
          (g.__musicCalls = g.__musicCalls || []).push([service, JSON.parse(JSON.stringify(data))]);
          var cur0 = hass.states[data.entity_id], a0 = Object.assign({}, cur0.attributes), st0 = cur0.state;
          if (service === 'media_pause') st0 = 'paused'; else if (service === 'media_play') st0 = 'playing';
          else if (service === 'play_media') { var pm = mockSpotifyTitle(data.media_content_id); st0 = 'playing'; a0.media_title = pm.title; a0.media_artist = pm.artist; a0.media_position = 0; a0.media_position_updated_at = new Date().toISOString(); }
          else if (service === 'media_seek') { a0.media_position = data.seek_position; a0.media_position_updated_at = new Date().toISOString(); }
          else if (service === 'volume_set') a0.volume_level = data.volume_level; else if (service === 'shuffle_set') a0.shuffle = !!data.shuffle; else if (service === 'repeat_set') a0.repeat = data.repeat; else if (service === 'select_source') a0.source = data.source;
          var ns0 = Object.assign({}, hass.states); ns0[data.entity_id] = Object.assign({}, cur0, { state: st0, attributes: a0, last_updated: new Date().toISOString() }); hass = Object.assign({}, hass, { states: ns0 }); onChange(hass);
          return Promise.resolve({});
        }
        if (domain === 'homeassistant' && service === 'update_entity') { (g.__updCalls = g.__updCalls || []).push([].concat(data.entity_id)); return Promise.resolve({}); }
        if (domain === 'automation') {                       // switch an automation: remembers what was asked, flips the state
          (g.__autoSvc = g.__autoSvc || []).push([service, data.entity_id]);
          var nsA = Object.assign({}, hass.states), eA = nsA[data.entity_id];
          if (eA) { var onA = service === 'toggle' ? eA.state !== 'on' : service === 'turn_on'; nsA[data.entity_id] = Object.assign({}, eA, { state: onA ? 'on' : 'off' }); hass = Object.assign({}, hass, { states: nsA }); onChange(hass); }
          return Promise.resolve({});
        }
        if (domain === 'scheduler') return new Promise(function (resolve) {
          setTimeout(function () {
            var list = g.__schedules = g.__schedules || [], ns = Object.assign({}, hass.states);
            var sync = function () {
              Object.keys(ns).forEach(function (k) { if (/^switch\.schedule_/.test(k)) delete ns[k]; });
              list.forEach(function (sc) { ns['switch.schedule_' + sc.schedule_id] = { entity_id: 'switch.schedule_' + sc.schedule_id, state: sc.enabled ? 'on' : 'off', attributes: { friendly_name: sc.name || 'Schedule', weekdays: sc.weekdays, timeslots: sc.timeslots.map(function (s) { return s.start; }), entities: sc.timeslots.reduce(function (acc, s) { (s.actions || []).forEach(function (a) { [].concat(a.entity_id || []).forEach(function (e) { if (acc.indexOf(e) < 0) acc.push(e); }); }); return acc; }, []), next_trigger: sc.enabled ? new Date(Date.now() + 20 * 3600e3).toISOString() : null }, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() }; });
              hass = Object.assign({}, hass, { states: ns }); onChange(hass);
            };
            (g.__schedCalls = g.__schedCalls || []).push([service, JSON.parse(JSON.stringify(data))]);
            if (service === 'add') list.push({ schedule_id: 'm' + (list.length + 1) + Math.floor(Math.random() * 99), weekdays: data.weekdays, timeslots: data.timeslots.map(function (s) { return Object.assign({ stop: null, conditions: [], condition_type: 'and' }, s); }), repeat_type: data.repeat_type, name: data.name || '', enabled: true });
            if (service === 'edit') { var sc = list.filter(function (x) { return 'switch.schedule_' + x.schedule_id === data.entity_id; })[0]; if (sc) { if (data.weekdays) sc.weekdays = data.weekdays; if (data.timeslots) sc.timeslots = data.timeslots; if (data.name != null) sc.name = data.name; } }
            if (service === 'remove') { var i = list.findIndex(function (x) { return 'switch.schedule_' + x.schedule_id === data.entity_id; }); if (i >= 0) list.splice(i, 1); }
            sync(); resolve({});
          }, 60);
        });
        if (domain === 'switch' && service === 'toggle' && /^switch\.schedule_/.test(data.entity_id)) return new Promise(function (resolve) {
          setTimeout(function () { var sc = (g.__schedules || []).filter(function (x) { return 'switch.schedule_' + x.schedule_id === data.entity_id; })[0]; if (sc) { sc.enabled = !sc.enabled; var ns = Object.assign({}, hass.states); ns[data.entity_id] = Object.assign({}, ns[data.entity_id], { state: sc.enabled ? 'on' : 'off', last_updated: new Date().toISOString() }); hass = Object.assign({}, hass, { states: ns }); onChange(hass); } resolve({}); }, 60);
        });
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            var id = data.entity_id, cur = hass.states[id];
            if (!cur) return reject(new Error('unknown entity'));
            if (g.__mockFail) { g.__mockFail = false; return reject(new Error('mock failure')); }
            var next = null, a = Object.assign({}, cur.attributes);
            var flip = function (on) { return on ? 'on' : 'off'; };
            if (service === 'toggle') next = flip(cur.state !== 'on' && cur.state !== 'playing');
            if (service === 'turn_on') next = domain === 'climate' ? 'heat' : 'on';
            if (service === 'turn_off') next = 'off';
            if (service === 'open_cover') { next = 'open'; a.current_position = 100; }
            if (service === 'close_cover') { next = 'closed'; a.current_position = 0; }
            if (service === 'set_cover_position') { a.current_position = data.position; next = data.position > 0 ? 'open' : 'closed'; }
            if (service === 'lock') next = 'locked';
            if (service === 'unlock') next = 'unlocked';
            if (service === 'start') next = 'cleaning';
            if (service === 'return_to_base') next = 'docked';
            if (service === 'set_temperature') { if (data.temperature !== undefined) a.temperature = data.temperature; if (data.target_temp_low !== undefined) { a.target_temp_low = data.target_temp_low; a.target_temp_high = data.target_temp_high; } next = cur.state; }
            if (service === 'set_hvac_mode') next = data.hvac_mode;
            if (domain === 'light' && service === 'turn_on') { if (data.brightness_pct != null) a.brightness = Math.round(data.brightness_pct * 2.55); else if (data.brightness != null) a.brightness = data.brightness; else if (!a.brightness) a.brightness = 255; if (data.color_temp_kelvin) a.color_temp_kelvin = data.color_temp_kelvin; }
            if (domain === 'light' && next === 'off') a.brightness = 0;
            if (domain === 'media_player' && service === 'media_pause') next = 'paused';
            if (domain === 'media_player' && service === 'media_play') next = 'playing';
            if (domain === 'fan' && data.percentage != null) { a.percentage = data.percentage; next = data.percentage > 0 ? 'on' : 'off'; }
            if (next == null) next = cur.state;
            var ns = Object.assign({}, hass.states);
            ns[id] = Object.assign({}, cur, { state: next, attributes: a, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() });
            hass = Object.assign({}, hass, { states: ns });
            onChange(hass);
            resolve({});
          }, 160);
        });
      },
      callApi: function (method, path, body) {
        var am = /^config\/automation\/config\/(.+)$/.exec(path);
        if (am) {                                            // the config API of Home Assistant: write, read and delete an automation
          var aid = am[1], store = g.__autos = g.__autos || {};
          (g.__autoCalls = g.__autoCalls || []).push([method, aid, body ? JSON.parse(JSON.stringify(body)) : null]);
          if (g.__autoFail) return Promise.reject(new Error('403'));
          var syncA = function () {
            setTimeout(function () {
              var nsB = Object.assign({}, hass.states);
              Object.keys(nsB).forEach(function (k) { if (/^automation\.okie_lm_/.test(k) && !store[nsB[k].attributes.id]) delete nsB[k]; });
              Object.keys(store).forEach(function (k) { var eid = 'automation.' + k, prev = nsB[eid]; nsB[eid] = { entity_id: eid, state: prev ? prev.state : 'on', attributes: { id: k, friendly_name: store[k].alias, last_triggered: null }, last_changed: new Date().toISOString(), last_updated: new Date().toISOString(), context: {} }; });
              hass = Object.assign({}, hass, { states: nsB }); onChange(hass);
            }, 100);
          };
          if (method === 'POST') { store[aid] = JSON.parse(JSON.stringify(body)); syncA(); return Promise.resolve({ result: 'ok' }); }
          if (method === 'DELETE') { delete store[aid]; syncA(); return Promise.resolve({ result: 'ok' }); }
          return store[aid] ? Promise.resolve(JSON.parse(JSON.stringify(store[aid]))) : Promise.reject(new Error('404'));
        }
        // history/period/<start>?filter_entity_id=x&end_time=...
        if (/^roomba_plus\/E_ROBO\/missions\/latest\/map\.json/.test(path)) return g.__mockMapFail ? Promise.reject(new Error('502')) : Promise.resolve(JSON.parse(JSON.stringify(g.__robomapFixture)));
        if (/^calendars\/calendar\.robo_schedule/.test(path)) {      // the robot's own cleaning times: one weekly event per weekday, 16:00, like the iRobot calendar
          var rows = [], dayR = new Date(); dayR.setHours(16, 0, 0, 0);
          for (var di = 0; di < 21; di++) { var sR = new Date(dayR.getTime() + di * 86400e3), wdR = sR.getDay(); rows.push({ summary: 'Cleaning', start: { dateTime: sR.toISOString() }, end: { dateTime: new Date(sR.getTime() + 3600e3).toISOString() }, rrule: 'FREQ=WEEKLY;BYDAY=' + ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][wdR], uid: 'weekday-' + wdR }); }
          return Promise.resolve(rows);
        }
        if (/^calendars\/calendar\.(work|birthdays)/.test(path)) {      // two read-only calendars like an iPhone's, spread over the next weeks
          var which = /work/.test(path) ? 'work' : 'birthdays', out = [], day0 = new Date(); day0.setHours(0, 0, 0, 0);
          var pq = /start=([^&]+)&end=([^&]+)/.exec(path), qs = pq ? Date.parse(decodeURIComponent(pq[1])) : -Infinity, qe = pq ? Date.parse(decodeURIComponent(pq[2])) : Infinity;
          for (var dd = -45; dd < 75; dd++) {
            var base = day0.getTime() + dd * 86400e3, dow = new Date(base).getDay(), dom = new Date(base).getDate();
            if (which === 'work' && dow >= 1 && dow <= 5 && (dd * 7 + dom) % 3 !== 0) out.push({ summary: ['Stand-up', 'Design review', 'Client call', '1:1 with Sam', 'Sprint planning'][(dom + dow) % 5], start: { dateTime: new Date(base + (9 + (dom % 4)) * 3600e3).toISOString() }, end: { dateTime: new Date(base + (10 + (dom % 4)) * 3600e3).toISOString() }, location: dow === 3 ? 'Room 4B' : '' });
            if (which === 'work' && dow === 2 && dom % 2 === 0) out.push({ summary: 'Team lunch', start: { dateTime: new Date(base + 12.5 * 3600e3).toISOString() }, end: { dateTime: new Date(base + 13.5 * 3600e3).toISOString() }, location: 'Taco Bus, Tampa' });
            if (which === 'birthdays' && (dom === 5 || dom === 19 || dom === 27)) out.push({ summary: ['Ana birthday', 'Mum birthday', 'Sam birthday'][[5, 19, 27].indexOf(dom)], start: { date: new Date(base).toISOString().slice(0, 10) }, end: { date: new Date(base + 86400e3).toISOString().slice(0, 10) } });
          }
          return Promise.resolve(out.filter(function (e) { var s0 = Date.parse(e.start.dateTime || e.start.date), e0 = Date.parse(e.end.dateTime || e.end.date); return s0 < qe && e0 > qs; }));
        }
        if (/^calendars\//.test(path)) {
          var mk = function (t, h, dur, loc) { var s = new Date(); s.setHours(h, 0, 0, 0); s = new Date(s.getTime() + t * 86400e3); return { summary: arguments[4] || '', start: { dateTime: s.toISOString() }, end: { dateTime: new Date(s.getTime() + dur * 3600e3).toISOString() }, location: loc || '' }; };
          return Promise.resolve([Object.assign(mk(0, 19, 2, 'Home'), { summary: 'Family dinner' }), Object.assign(mk(1, 9, 1), { summary: 'Dentist' }), Object.assign(mk(2, 15, 1), { summary: 'Piano lesson' }), Object.assign(mk(3, 18, 1.5), { summary: 'Cinema' }), Object.assign(mk(5, 10, 1), { summary: 'Plumber' })]);
        }
        var m = /history\/period\/([^?]+)\?(.*)/.exec(path);
        if (!m) return Promise.resolve([]);
        var start = Date.parse(decodeURIComponent(m[1])), q = new URLSearchParams(m[2]);
        var end = q.get('end_time') ? Date.parse(q.get('end_time')) : Date.now();
        var id = q.get('filter_entity_id'), st = hass.states[id];
        var rows = [], numeric = !isNaN(parseFloat(st && st.state)) && (st.attributes.unit_of_measurement || /^sensor\./.test(id));
        var t = start, v = numeric ? parseFloat(st.state) : 0, on = false, seed = 7;
        function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
        while (t < end) {
          if (numeric) { v += (rnd() - 0.5) * 1.2; rows.push({ state: String(Math.round(v * 10) / 10), last_changed: new Date(t).toISOString() }); t += 20 * 60e3; }
          else { on = !on; rows.push({ state: on ? (id.indexOf('lock.') === 0 ? 'unlocked' : 'on') : (id.indexOf('lock.') === 0 ? 'locked' : 'off'), last_changed: new Date(t).toISOString() }); t += (on ? 25 : 140) * 60e3 * (0.5 + rnd()); }
        }
        return Promise.resolve([rows]);
      },
      callWS: function (msg) {
        if (msg.type === 'media_player/browse_media') {
          (g.__browseCalls = g.__browseCalls || []).push([msg.media_content_id || null, msg.media_content_type || null]);
          var bst = hass.states[msg.entity_id];
          if (!bst || !(bst.attributes.supported_features & 131072)) return Promise.reject({ code: 'unknown_error', message: 'Player does not support browsing media' });
          if (g.__browseFail) return Promise.reject({ code: 'unknown_error', message: g.__browseFail });
          return new Promise(function (r) { setTimeout(function () { r(mockSpotifyBrowse(msg.media_content_id, msg.media_content_type)); }, 120); });
        }
        if (msg.type === 'scheduler') return Promise.resolve(JSON.parse(JSON.stringify((g.__schedules || []).map(function (sc) { return Object.assign({}, sc, { entity_id: 'switch.schedule_' + sc.schedule_id, tags: [] }); }))));
        if (msg.type === 'config/entity_registry/get') return Promise.resolve({ entity_id: msg.entity_id, platform: msg.entity_id === 'media_player.living_room_tv' ? 'samsungtv' : 'cast', device_id: 'dev-' + msg.entity_id.split('.')[1] });
        if (msg.type === 'config/entity_registry/list') return Promise.resolve([{ entity_id: 'media_player.living_room_tv', platform: 'samsungtv', device_id: 'dev-living_room_tv' }, { entity_id: 'remote.living_room_tv', platform: 'samsungtv', device_id: 'dev-living_room_tv' }].concat(Object.keys(hass.states).filter(function (id) { return /(^|\.)robo(_|$)/.test(id); }).map(function (id) { return { entity_id: id, platform: 'roomba', device_id: 'dev-robo' }; })));
        if (msg.type === 'frontend/get_user_data') return Promise.resolve({ value: (g.__userData || {})[msg.key] || null });
        if (msg.type === 'frontend/set_user_data') { (g.__userData = g.__userData || {})[msg.key] = msg.value; return Promise.resolve(); }
        var d = function (o) { return new Date(Date.now() + o * 86400e3).toISOString().slice(0, 10); };
        if (msg.type === 'todo/item/list') {
          if (msg.entity_id === 'todo.tasks') return Promise.resolve({ items: g.__todos || (g.__todos = [
            { uid: 't1', summary: 'Test', status: 'needs_action', due: d(-126) },
            { uid: 't2', summary: 'Pay rent', status: 'needs_action', due: d(2) },
            { uid: 't3', summary: 'Take out trash', status: 'needs_action', due: d(-3) },
            { uid: 't4', summary: 'Take out trash', status: 'needs_action', due: d(-2) },
            { uid: 't5', summary: 'Water plants', status: 'needs_action' },
          ]) });
          return Promise.resolve({ items: [{ uid: 's1', summary: 'Milk', status: 'needs_action' }, { uid: 's2', summary: 'Bread', status: 'completed' }] });
        }
        if (msg.type === 'call_service' && msg.service === 'get_forecasts') {
          var key = msg.target.entity_id, f = [], hourly = msg.service_data.type === 'hourly';
          for (var i = 0; i < 8; i++) f.push({ datetime: new Date(Date.now() + i * (hourly ? 3600e3 : 86400e3)).toISOString(), temperature: 16 + (i % 4), templow: 9 + (i % 3), condition: ['partlycloudy', 'sunny', 'rainy', 'cloudy'][i % 4] });
          var resp = {}; resp[key] = { forecast: f };
          return Promise.resolve({ response: resp });
        }
        if (msg.type === 'energy/get_prefs') return Promise.resolve({ energy_sources: [{ type: 'grid', flow_from: [{ stat_energy_from: 'sensor.grid_in' }], flow_to: [{ stat_energy_to: 'sensor.grid_out' }] }, { type: 'solar', stat_energy_from: 'sensor.solar' }], device_consumption: [] });
        if (msg.type === 'recorder/statistics_during_period') {
          var out = {}, start = Date.parse(msg.start_time), end = msg.end_time ? Date.parse(msg.end_time) : Date.now(), stepMs = msg.period === 'hour' ? 3600e3 : 86400e3;
          msg.statistic_ids.forEach(function (id) { out[id] = []; for (var t0 = start; t0 < end; t0 += stepMs) { var hr = new Date(t0).getHours(), sun = msg.period === 'hour' ? Math.max(0, Math.sin((hr - 6) / 12 * Math.PI)) : 1, v = id === 'sensor.solar' ? 2.2 * sun * (msg.period === 'hour' ? 1 : 8) : id === 'sensor.grid_out' ? 0.4 * sun * (msg.period === 'hour' ? 1 : 3) : (0.3 + 0.2 * Math.abs(Math.sin(hr / 3))) * (msg.period === 'hour' ? 1 : 12); out[id].push({ start: t0, end: t0 + stepMs, change: Math.round(v * 100) / 100 }); } });
          return Promise.resolve(out);
        }
        if (msg.type === 'logbook/get_events' && msg.entity_ids) {       // the runs of scripts, scenes and our automations (the History tab of the light modes)
          var rowsL = [], nowL = Date.now();
          msg.entity_ids.forEach(function (id, i) {
            if (/^script\./.test(id)) { rowsL.push({ when: (nowL - (2 + i) * 3600000) / 1000, entity_id: id, name: id, message: 'started', context_user_id: 'u1' }); rowsL.push({ when: (nowL - (26 + i) * 3600000) / 1000, entity_id: id, name: id, message: 'started', context_domain: 'automation', context_event_type: 'automation_triggered' }); }
          });
          return Promise.resolve(rowsL);
        }
        if (msg.type === 'logbook/get_events') return Promise.resolve([
          { when: (Date.now() - 20 * 60000) / 1000, entity_id: 'light.kitchen_ceiling', state: 'on', name: 'Kitchen Ceiling' },
          { when: (Date.now() - 55 * 60000) / 1000, entity_id: 'binary_sensor.kitchen_window', state: 'on', name: 'Kitchen Window' },
          { when: (Date.now() - 3 * 3600000) / 1000, entity_id: 'lock.front_door', state: 'locked', name: 'Front Door Lock' },
        ]);
        if (msg.type === 'history/history_during_period') {          // the ring and motion events of the last days, as Home Assistant answers with minimal_response
          var ago = function (m) { return Date.now() - m * 60000; }, row = function (t) { return { s: new Date(t).toISOString(), lu: t / 1000 }; }, res = {};
          msg.entity_ids.forEach(function (id) {
            if (id === 'event.patio_motion') res[id] = [ago(35), ago(180), ago(300), ago(1200), ago(1800), ago(3100)].reverse().map(row);
            else if (id === 'event.patio_ding') res[id] = [ago(240), ago(1700)].reverse().map(row);
            else if (id === 'binary_sensor.patio_motion') res[id] = [{ s: 'on', lu: ago(35) / 1000 + 1.5 }, { s: 'off', lu: ago(34) / 1000 }];       // the sensor and the event of the same motion: one entry
            else if (id === 'vacuum.robo') res[id] = [{ s: 'docked', lu: ago(3000) / 1000 }, { s: 'cleaning', lu: ago(2900) / 1000 }, { s: 'returning', lu: ago(2880) / 1000 }, { s: 'docked', lu: ago(2870) / 1000 }, { s: 'cleaning', lu: ago(130) / 1000 }, { s: 'returning', lu: ago(124) / 1000 }, { s: 'docked', lu: ago(121) / 1000 }];
            else res[id] = [];
          });
          return Promise.resolve(res);
        }
        if (msg.type === 'conversation/process') return new Promise(function (r) { setTimeout(function () {
          var tx = String(msg.text || ''), light = /light|licht/i.test(tx), lock = /lock|schloss|abgeschlossen|haust/i.test(tx);
          var data = light ? { success: [{ name: 'Living Room Lamp', type: 'entity', id: 'light.living_room_lamp' }, { name: 'Kitchen Ceiling', type: 'entity', id: 'light.kitchen_ceiling' }], failed: [] } : (lock ? { success: [{ name: 'Front Door Lock', type: 'entity', id: 'lock.front_door' }], failed: [] } : {});
          r({ conversation_id: 'c1', response: { response_type: light ? 'action_done' : 'query_answer', data: data, speech: { plain: { speech: light ? 'Done, I switched the lights.' : (lock ? 'The front door is locked.' : 'You asked: ' + tx) } } } });
        }, 350); });
        if (msg.type === 'media_source/browse_media') { var imgs = ['bedroom-demo', 'kitchen-demo', 'livingroom-demo', 'home-demo']; return Promise.resolve({ children: imgs.map(function (n) { return { title: n, media_class: 'image', can_expand: false, media_content_id: 'media-source://media_source/local/' + n + '.jpg', thumbnail: '/Hemma/custom_components/hemma/assets/rooms/' + n + '.jpg' }; }) }); }
        if (msg.type === 'media_source/resolve_media') return Promise.resolve({ url: '/Hemma/custom_components/hemma/assets/rooms/' + msg.media_content_id.split('/').pop() });
        if (msg.type === 'search/related') return Promise.resolve({ scene: ['scene.movie_night'], script: ['script.goodnight'], automation: msg.item_id === 'script.govee_cozy_lights' ? ['automation.sunset_lights'] : [] });
        return Promise.resolve({});
      },
    };
    g.__spotifySet = function (fn) {      // dev/test hook: change the pretend Spotify player the way Home Assistant would (fn gets a copy of its attributes and returns them, or { attrs, state })
      var sid = 'media_player.spotify_alex', cur = hass.states[sid], a = Object.assign({}, cur.attributes), r = fn(a) || a, ns = Object.assign({}, hass.states);
      ns[sid] = Object.assign({}, cur, { state: r.state || cur.state, attributes: r.attrs || r, last_updated: new Date().toISOString() });
      hass = Object.assign({}, hass, { states: ns }); onChange(hass);
    };
    return { get hass() { return hass; } };
  }
  // a stand-in for the floor plan card of the Overview dashboard (Home Assistant loads the real one as a dashboard resource)
  if (g.customElements && !g.customElements.get('floorplan-card')) g.customElements.define('floorplan-card', class extends HTMLElement { constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = '<svg id="plan" viewBox="0 -60 860 2010" style="width:100%;height:100%"><g id="pg"><g transform="scale(1 1)"><g transform="translate(-290 -40)"><polygon points="351,625 1065,625 1065,1882 462,1882 462,1300 351,1300" fill="#d8d2c4"/></g></g></g></svg>'; } setConfig(c) { this._cfg = c; } set hass(v) { this._hass = v; this.textContent = 'floor plan' + (this._cfg && this._cfg.bare ? ' (bare)' : '') + ' ' + JSON.stringify(this._cfg || {}); } });
  g.makeMockHass = makeHass;
  g.__mockEntities = list;
})(window);

/** URL options for looking at one thing quickly (the browser demo and the test harness both call this):
 *   ?f=1                          the Nest of the real house: Fahrenheit, 73 degrees cooling, 50-90, Heat / Cool / Heat-Cool, presets none / eco, fan on / off
 *   ?open=climate.living_room     skip the lock page and open that device's detail at once */
function applyDemoParams(q, card, m) {
  var hs = m.hass;
  if (q.get('f') === '1') {
    hs.config.unit_system.temperature = '°F';
    var st = hs.states['climate.living_room'];
    if (st) hs.states['climate.living_room'] = Object.assign({}, st, { state: 'cool', attributes: Object.assign({}, st.attributes, { temperature: 73, current_temperature: 73, min_temp: 50, max_temp: 90, target_temp_step: 1,
      hvac_modes: ['off', 'heat', 'cool', 'heat_cool'], hvac_action: 'cooling', preset_modes: ['none', 'eco'], preset_mode: 'none', fan_modes: ['on', 'off'], fan_mode: 'off' }) });
  }
  var sp = q.get('spotify');      // ?spotify=open|pick|load: Spotify as Home Assistant shows it before the library is unlocked (nothing running / devices known, none active / a device active, nothing loaded)
  if (sp) {
    var sid = 'media_player.spotify_alex', was0 = hs.states[sid], A = Object.assign({}, was0.attributes);
    ['media_title', 'media_artist', 'media_album_name', 'media_duration', 'media_position', 'media_position_updated_at', 'entity_picture', 'volume_level', 'shuffle', 'repeat', 'source', 'source_list'].forEach(function (k) { delete A[k]; });
    A.supported_features = 2048; if (sp === 'pick' || sp === 'load') A.source_list = ['iPad', 'iPhone']; if (sp === 'load') A.source = 'iPad';
    hs.states[sid] = Object.assign({}, was0, { state: 'idle', attributes: A });
  }
  var open = q.get('open');
  if (open) setTimeout(function () { try { if (card._locked) card._setLocked(false, true); card._openDetail(open); } catch (e) { /* the device does not exist in the sample data */ } }, 1500);
}

/** A small pretend Spotify library for the Music screen: the same shape Home Assistant answers with (ids and types as the Spotify integration writes them). */
var SPOTIFY_MOCK = (function () {
  var art = function (c) { return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="' + c + '"/><circle cx="100" cy="100" r="58" fill="rgba(255,255,255,.3)"/></svg>'); };
  var colors = ['#7a4cc9', '#c94c7a', '#4c9ac9', '#c9a14c', '#4cc98a', '#c96a4c'];
  var node = function (title, id, type, cls, kids, o) { return Object.assign({ title: title, media_content_id: id, media_content_type: 'spotify://' + type, media_class: cls, children_media_class: kids || null, can_play: false, can_expand: false, thumbnail: null }, o || {}); };
  var track = function (id, n) { return node(n, 'spotify:track:' + id, 'track', 'track', null, { can_play: true }); };
  var listOf = function (prefix, names, type, cls, kids) { return names.map(function (n, i) { return node(n, 'spotify:' + prefix + ':' + (i + 1), type, cls, kids, { can_play: true, can_expand: true, thumbnail: art(colors[i % 6]) }); }); };
  var songs = function (p, n) { var a = []; for (var i = 1; i <= n; i++) a.push(track(p + '_' + i, 'Song ' + i + ' of ' + p)); return a; };
  var sections = [['Playlists', 'current_user_playlists', 'playlist'], ['Artists', 'current_user_followed_artists', 'artist'], ['Albums', 'current_user_saved_albums', 'album'], ['Liked songs', 'current_user_saved_tracks', 'track'], ['Podcasts', 'current_user_saved_shows', 'podcast'], ['Recently played', 'current_user_recently_played', 'track'], ['Top Artists', 'current_user_top_artists', 'artist'], ['Top Tracks', 'current_user_top_tracks', 'track']];
  var data = {
    current_user_playlists: listOf('playlist', ['Morning Drive', 'Focus', 'Chill Beats', 'Party Mix', 'Gym', 'Road Trip'], 'playlist', 'playlist', 'track'),
    current_user_followed_artists: listOf('artist', ['The Test Band', 'Mock Quartet', 'Sample Singer'], 'artist', 'artist', 'album'),
    current_user_saved_albums: listOf('album', ['Waking the Test', 'Second Album', 'Live in Harness', 'Greatest Mocks'], 'album', 'album', 'track'),
    current_user_saved_tracks: songs('liked', 14),
  };
  data.current_user_top_artists = data.current_user_followed_artists; data.current_user_recently_played = songs('recent', 5); data.current_user_top_tracks = songs('top', 5); data.current_user_saved_shows = [];
  return { sections: sections, data: data, node: node, songs: songs, listOf: listOf };
})();
function mockSpotifyBrowse(id, type) {
  var M = SPOTIFY_MOCK, t = String(type || '').replace(/^spotify:\/\//, '');
  if (!id || t === 'library') {
    return M.node('Media Library', 'library', 'library', 'directory', 'directory', { can_expand: true, children: M.sections.map(function (x) { return M.node(x[0], x[1], x[1], 'directory', x[2], { can_expand: true, can_play: x[1] === 'current_user_saved_tracks' }); }) });
  }
  var kids = M.data[id], title = id, kc = null;
  if (!kids) {
    var m = /^spotify:(playlist|album|artist):(\d+)$/.exec(id);
    if (m) { kids = m[1] === 'artist' ? M.listOf('album', ['Waking the Test', 'Second Album'], 'album', 'album', 'track') : M.songs(m[1] + m[2], 8); title = { playlist: 'Playlist ', album: 'Album ', artist: 'Artist ' }[m[1]] + m[2]; kc = m[1] === 'artist' ? 'album' : 'track'; }
  } else { M.sections.forEach(function (x) { if (x[1] === id) { title = x[0]; kc = x[2]; } }); }
  if (!kids) return { title: 'Unknown', media_content_id: id, media_content_type: type, media_class: 'directory', can_play: false, can_expand: true, children: [] };
  return M.node(title, id, t, 'directory', kc, { can_expand: true, can_play: ['playlist', 'album', 'artist', 'current_user_saved_tracks'].indexOf(t) >= 0, children: kids });
}
function mockSpotifyTitle(id) { var m = /^spotify:track:(.+)$/.exec(String(id || '')); return { title: m ? m[1].replace(/_/g, ' ').replace(/^(\w+) (\d+)$/, 'Song $2 of $1') : 'Mock ' + id, artist: 'Mock Artist' }; }
