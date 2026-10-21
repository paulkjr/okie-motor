'use strict';
// A small but realistic Home Assistant `hass` for the tests and the browser harness.
function ent(id, name, state, attrs, reg) {
  return { id: id, st: { entity_id: id, state: state, attributes: Object.assign({ friendly_name: name }, attrs || {}) }, reg: reg || {} };
}
const list = [
  ent('light.kitchen_ceiling', 'Kitchen Ceiling', 'on', { brightness: 180 }, { area_id: 'kitchen' }),
  ent('light.kitchen_counter', 'Kitchen Counter', 'off', {}, { area_id: 'kitchen' }),
  ent('light.living_room_lamp', 'Living Room Lamp', 'on', { brightness: 90 }, { area_id: 'living_room' }),
  ent('light.living_room_strip', 'Living Room LED Strip', 'off', {}, { area_id: 'living_room' }),
  ent('light.bedroom_main', 'Bedroom Light', 'off', {}, { area_id: 'bedroom' }),
  ent('switch.coffee_machine', 'Coffee Machine', 'off', {}, { area_id: 'kitchen' }),
  ent('switch.garden_pump', 'Garden Pump', 'off', {}, { area_id: 'garden' }),
  ent('climate.living_room', 'Living Room Thermostat', 'heat', { current_temperature: 21.5, temperature: 22 }, { area_id: 'living_room' }),
  ent('climate.bedroom', 'Bedroom Thermostat', 'off', {}, { area_id: 'bedroom' }),
  ent('cover.living_room_blinds', 'Living Room Blinds', 'open', { current_position: 100 }, { area_id: 'living_room' }),
  ent('cover.garage_door', 'Garage Door', 'closed', { device_class: 'garage' }, { area_id: 'garage' }),
  ent('lock.front_door', 'Front Door Lock', 'locked', {}, { area_id: 'hallway' }),
  ent('media_player.living_room_tv', 'Living Room TV', 'playing', {}, { area_id: 'living_room' }),
  ent('media_player.kitchen_speaker', 'Kitchen Speaker', 'idle', {}, { area_id: 'kitchen' }),
  ent('fan.bedroom_fan', 'Bedroom Fan', 'off', {}, { area_id: 'bedroom' }),
  ent('sensor.kitchen_temperature', 'Kitchen Temperature', '21.0', { device_class: 'temperature', unit_of_measurement: '°C' }, { area_id: 'kitchen' }),
  ent('sensor.living_room_temperature', 'Living Room Temperature', '21.5', { device_class: 'temperature', unit_of_measurement: '°C' }, { area_id: 'living_room' }),
  ent('sensor.living_room_humidity', 'Living Room Humidity', '48', { device_class: 'humidity', unit_of_measurement: '%' }, { area_id: 'living_room' }),
  ent('sensor.bedroom_temperature', 'Bedroom Temperature', '19.0', { device_class: 'temperature' }, { area_id: 'bedroom' }),
  ent('sensor.kitchen_sensor_linkquality', 'Kitchen Sensor Linkquality', '120', {}, { area_id: 'kitchen' }),
  ent('sensor.phone_battery', 'Phone Battery', '77', { device_class: 'battery' }, { entity_category: 'diagnostic' }),
  ent('binary_sensor.hallway_motion', 'Hallway Motion', 'off', { device_class: 'motion' }, { area_id: 'hallway' }),
  ent('binary_sensor.kitchen_window', 'Kitchen Window', 'on', { device_class: 'window' }, { area_id: 'kitchen' }),
  ent('camera.front_door', 'Front Door Camera', 'idle', {}, { area_id: 'hallway' }),
  ent('vacuum.robo', 'Robo Vacuum', 'docked', {}, { area_id: 'living_room' }),
  ent('scene.movie_night', 'Movie Night', 'scening', {}, {}),
  ent('script.goodnight', 'Goodnight', 'off', {}, {}),
  ent('automation.sunset_lights', 'Sunset Lights', 'on', {}, {}),
  ent('weather.home', 'Home Weather', 'sunny', {}, {}),
  ent('light.kuche_spots', 'Küche Spots', 'on', {}, { area_id: 'kuche' }),
  ent('update.core', 'Core Update', 'off', {}, { entity_category: 'diagnostic' }),
  ent('light.hidden_one', 'Secret Light', 'on', {}, { hidden: true, area_id: 'bedroom' }),
];
const areas = {
  kitchen: { area_id: 'kitchen', name: 'Kitchen' },
  living_room: { area_id: 'living_room', name: 'Living Room' },
  bedroom: { area_id: 'bedroom', name: 'Bedroom' },
  hallway: { area_id: 'hallway', name: 'Hallway' },
  garage: { area_id: 'garage', name: 'Garage' },
  garden: { area_id: 'garden', name: 'Garden' },
  kuche: { area_id: 'kuche', name: 'Küche' },
};
function makeHass() {
  const states = {}, entities = {};
  list.forEach(function (e) {
    states[e.id] = e.st;
    entities[e.id] = Object.assign({ entity_id: e.id }, e.reg);
  });
  return { states, entities, areas, devices: {} };
}
module.exports = { makeHass, list };
