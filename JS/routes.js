// filepath: JS/routes.js
// Route coordinates and schedules for estimated positioning
// Used as fallback when no live GPS submissions are available

const ROUTES = {
  "Palwal–Chandigarh ": {
    stops: [
      { name: "Palwal Bus Stand", lat: 28.1472305, lng: 77.3341779 },
      { name: "Ballabhgarh Chowk", lat: 28.3392397, lng: 77.3207836 },
      { name: "Faridabad Sector 28", lat: 28.4383830, lng: 77.3084020 },
      { name: "Sonipat Bus Stand", lat: 28.9964841, lng: 77.0237155 },
      { name: "Panipat Bus Stand", lat: 29.3979302, lng: 76.9696755 },
      { name: "Karnal Bus Stand", lat: 29.6910146, lng: 76.9871091 },
      { name: "Ambala Cantt Bus Stand", lat: 30.3404663, lng: 76.8298317 },
      { name: "Ambala Cantt Railway Station", lat: 30.3378010, lng: 76.8280638 },
      { name: "Zirakpur Bus Stop", lat: 30.6311217, lng: 76.8230571 },
      { name: "Chandigarh ISBT Sector 43", lat: 30.7167235, lng: 76.7432050 }
    ],
    schedule: ["08:00", "08:02", "08:04", "08:06", "08:08", "08:10", "08:12", "08:14", "08:16", "08:18"]
  },

  "Yamunanagar–Kurukshetra ": {
    stops: [
      { name: "Yamunanagar Bus Depot", lat: 30.1346984, lng: 77.2771122 },
      { name: "Jagadhri Bus Stand Chowk", lat: 30.1647386, lng: 77.2979622 },
      { name: "Radaur Chowk", lat: 30.0353070, lng: 77.1573310 },
      { name: "Ladwa Bus Stand", lat: 29.9953389, lng: 77.0404079 },
      { name: "Shahabad Bus Stand", lat: 30.1696729, lng: 76.8618961 },
      { name: "Kurukshetra University 3rd Gate", lat: 29.9631913, lng: 76.8115352 },
      { name: "Kurukshetra New Bus Stand", lat: 29.9735003, lng: 76.8650300 }
    ],
    schedule: ["10:00", "10:02", "10:04", "10:06", "10:08", "10:10", "10:12"]
  },

  "Jaipur–Delhi ": {
    stops: [
      { name: "Jaipur Sindhi Camp Bus Stand", lat: 26.9234262, lng: 75.8005513 },
      { name: "Kotputli Bus Depot", lat: 27.7059774, lng: 76.1952308 },
      { name: "Behror Bus Stand", lat: 27.8916913, lng: 76.2938536 },
      { name: "Roadways Bus Stand Alwar", lat: 27.5617130, lng: 76.6022107 },
      { name: "Shahjahanpur Toll Plaza", lat: 27.9998994, lng: 76.4305671 },
      { name: "Rewari Bus Stand", lat: 28.1923472, lng: 76.6162284 },
      { name: "Dharuhera Bus Stop", lat: 28.2081190, lng: 76.7920900 },
      { name: "Manesar Bus Stop", lat: 28.3547260, lng: 76.9375455 },
      { name: "IFFCO Chowk Gurugram", lat: 28.4773780, lng: 77.0695320 },
      { name: "Mahipalpur Bus Stop", lat: 28.5480520, lng: 77.1251580 },
      { name: "Dhaula Kuan Bus Stop", lat: 28.5932618, lng: 77.1629415 },
      { name: "Sarai Kale Khan ISBT Delhi", lat: 28.5836812, lng: 77.2599122 }
    ],
    schedule: ["07:00", "07:02", "07:04", "07:06", "07:08", "07:10", "07:12", "07:14", "07:16", "07:18", "07:20", "07:22"]
  }
};

// Helper: Convert time string or Date to minutes since midnight
function parseMinutes(time) {
  if (time instanceof Date) {
    // Add seconds and milliseconds as fractions of a minute for smooth continuous movement
    return time.getHours() * 60 + time.getMinutes() + (time.getSeconds() / 60) + (time.getMilliseconds() / 60000);
  }
  if (typeof time === 'string') {
    const parts = time.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}

// Main function: Get estimated bus position along route at given time
window.getBusPosition = function (routeId, currentTime) {
  const route = ROUTES[routeId];
  if (!route) {
    return null;
  }

  const { stops, schedule } = route;
  if (!stops || stops.length === 0 || !schedule || schedule.length === 0) {
    return null;
  }

  // Convert current time to minutes since midnight
  const currentMinutes = parseMinutes(currentTime);

  // Convert all schedule times to minutes
  const scheduleMinutes = schedule.map((timeStr) => parseMinutes(timeStr));

  // Edge case: before first stop
  if (currentMinutes < scheduleMinutes[0]) {
    return {
      lat: stops[0].lat,
      lng: stops[0].lng,
      stopName: stops[0].name
    };
  }

  // Edge case: after last stop — bus is no longer running. Return null so the map
  // does NOT fall back to the originating city (e.g. Jaipur) for the rest of the day.
  // The caller (updateEstimatedPosition) handles null gracefully.
  if (currentMinutes >= scheduleMinutes[scheduleMinutes.length - 1]) {
    return null;
  }

  // Find the segment: scheduleMinutes[i] <= currentMinutes < scheduleMinutes[i+1]
  let segmentIndex = -1;
  for (let i = 0; i < scheduleMinutes.length - 1; i++) {
    if (scheduleMinutes[i] <= currentMinutes && currentMinutes < scheduleMinutes[i + 1]) {
      segmentIndex = i;
      break;
    }
  }

  if (segmentIndex === -1) {
    return null;
  }

  // Interpolate between stops[segmentIndex] and stops[segmentIndex + 1]
  const stopA = stops[segmentIndex];
  const stopB = stops[segmentIndex + 1];
  const timeA = scheduleMinutes[segmentIndex];
  const timeB = scheduleMinutes[segmentIndex + 1];

  // Ratio: how far between stop A and stop B (0 = at A, 1 = at B)
  const ratio = (currentMinutes - timeA) / (timeB - timeA);

  const interpolatedLat = stopA.lat + ratio * (stopB.lat - stopA.lat);
  const interpolatedLng = stopA.lng + ratio * (stopB.lng - stopA.lng);

  return {
    lat: interpolatedLat,
    lng: interpolatedLng,
    stopName: stopB.name
  };
};
