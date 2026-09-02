/**
 * Web mock for satelliteSms.js
 * Since expo-sqlite breaks Webpack/Metro on Web due to missing wasm configurations,
 * and SMS is not available on Web, we simply mock the functions here.
 */

export function encodeSmsPayload({ incidentId, type, severity, lat, lng, description }) {
  return `NNER|${incidentId}|${type}|${severity}|${lat}|${lng}|${description}`;
}

export async function saveIncidentLocally(report) {
  console.log('Web Mock: Saved incident locally', report);
  return { incidentId: 'WEB_INC_123', createdAt: new Date().toISOString() };
}

export async function dispatchSatelliteSms(report) {
  console.log('Web Mock: Dispatching satellite SMS', report);
  return { incidentId: 'WEB_INC_123', createdAt: new Date().toISOString(), payload: 'MOCK', smsResult: 'sent' };
}

export async function getPendingImageUploads() {
  return [];
}

export async function syncPendingSatelliteImages() {
  return 0;
}

export async function getAllSatelliteIncidents() {
  return [];
}
