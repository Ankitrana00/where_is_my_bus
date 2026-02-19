// Read URL Parameters
const params = new URLSearchParams(window.location.search);

const from = params.get("from");
const to = params.get("to");

// Show in console (test)
console.log("From:", from);
console.log("To:", to);

const container = document.querySelector(".container");

const sampleBuses = [
  {
    id: "Palwal–Chandigarh ",
    route: ["Palwal", "Ambala", "Chandigarh"],
    schedule: ["08:30", "12:00", "16:30"],
    status: "estimated",
    active: true
  },
  {
    id: "Yamunanagar–Kurukshetra ",
    route: ["Yamunanagar", "Shahbad", "Kurukshetra"],
    schedule: ["10:15", "13:45", "14:10"],
    status: "estimated",
    active: true
  },
  {
    id: "Jaipur–Delhi ",
    route: ["Jaipur", "Alwar", "Gurugram", "Delhi"],
    schedule: ["07:00", "11:20", "15:40", "19:00"],
    status: "estimated",
    active: true
  }
];

const liveListeners = {};
const lastUpdateMap = {};
const pendingUpdates = {};
let rafScheduled = false;
let timestampIntervalId = null;
let staleCheckIntervalId = null;
let trackClickBound = false;
const busIdToKey = new Map();
const usedKeys = new Set();

// Show loading state
container.innerHTML = `
  <div class="loading">
    <p>🔍 Searching for buses...</p>
  </div>
`;

// Before filtering, validate URL parameters
if (!from || !to) {
  container.innerHTML = `
    <p>⚠️ Missing search parameters. <a href="/HTML/index.html">Go back</a></p>
  `;
} else {
  const timeout = setTimeout(() => {
    container.innerHTML = `
      <p>⚠️ Request timed out. <button onclick="location.reload()">Retry</button></p>
    `;
  }, 10000);

  if (!window.db) {
    console.log("No Firebase DB, using sampleBuses");
    clearTimeout(timeout);
    filterAndDisplayBuses(sampleBuses);
  } else {
    db.ref('buses').once('value')
      .then((snapshot) => {
        clearTimeout(timeout);
        const data = snapshot.val();
        
        console.log("Firebase 'buses' data:", data);

        if (!data || Object.keys(data).length === 0) {
          console.log("Firebase empty or null, falling back to sampleBuses");
          filterAndDisplayBuses(sampleBuses);
          return;
        }

        const buses = Object.values(data); // Show ALL buses, not just active ones
        console.log("Using Firebase buses:", buses);
        filterAndDisplayBuses(buses);
      })
      .catch((error) => {
        clearTimeout(timeout);
        console.error("Firebase error:", error);
        console.log("Firebase error, falling back to sampleBuses");
        filterAndDisplayBuses(sampleBuses);
      });
  }
}

function calculateVariance(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredDiffs = values.map((value) => (value - mean) ** 2);
  return squaredDiffs.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateLocations(snapshot) {
  const data = snapshot.val();
  if (!data) return null;

  const now = Date.now();
  const locations = Object.values(data)
    .map((entry) => ({
      lat: Number(entry.lat),
      lng: Number(entry.lng),
      time: Number(entry.time),
      accuracy: Number(entry.accuracy),
      age: now - Number(entry.time)
    }))
    .filter((entry) =>
      Number.isFinite(entry.lat) &&
      Number.isFinite(entry.lng) &&
      Number.isFinite(entry.time)
    )
    .filter((entry) => (now - entry.time) <= 120000);

  if (locations.length === 0) return null;

  const avgLat = locations.reduce((sum, entry) => sum + entry.lat, 0) / locations.length;
  const avgLng = locations.reduce((sum, entry) => sum + entry.lng, 0) / locations.length;
  const distances = locations.map((entry) => {
    const dLat = entry.lat - avgLat;
    const dLng = entry.lng - avgLng;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  });

  const variance = calculateVariance(distances);
  const lastUpdate = locations.reduce((latest, entry) => Math.max(latest, entry.time), 0);

  return {
    numUsers: locations.length,
    variance,
    lastUpdate
  };
}

function calculateConfidence(numUsers, variance) {
  return Math.min(100, Math.round(numUsers * 10 + 50 / (variance + 1)));
}

function determineStatus(numUsers, confidence) {
  if (numUsers >= 2 && confidence >= 70) return 'live';
  if (numUsers === 1 || confidence >= 50) return 'estimated';
  return 'offline';
}

function updateTimestampText(busId, lastUpdate) {
  const key = getBusKey(busId);
  if (!key) return;

  const updateEl = document.getElementById(`update-${key}`);
  if (!updateEl) return;

  if (!lastUpdate) {
    updateEl.textContent = 'No recent data';
    return;
  }

  const minutesAgo = Math.max(0, Math.floor((Date.now() - lastUpdate) / 60000));
  updateEl.textContent = `${minutesAgo} min ago`;
}

function refreshAllTimestamps() {
  Object.keys(lastUpdateMap).forEach((busId) => {
    updateTimestampText(busId, lastUpdateMap[busId]);
  });
}

function checkForStaleUpdates() {
  const now = Date.now();
  Object.keys(lastUpdateMap).forEach((busId) => {
    const lastUpdate = lastUpdateMap[busId];
    if (!lastUpdate || (now - lastUpdate) > 120000) {
      pendingUpdates[busId] = {
        confidence: 0,
        status: 'offline',
        lastUpdate: null
      };
    }
  });

  if (Object.keys(pendingUpdates).length > 0 && !rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(flushPendingUpdates);
  }
}

function flushPendingUpdates() {
  rafScheduled = false;
  const updates = { ...pendingUpdates };
  Object.keys(pendingUpdates).forEach((key) => delete pendingUpdates[key]);

  Object.entries(updates).forEach(([busId, update]) => {
    const key = getBusKey(busId);
    if (!key) return;

    const confEl = document.getElementById(`conf-${key}`);
    const statusEl = document.querySelector(`.status[data-bus-key="${key}"]`);
    if (!confEl || !statusEl) return;

    confEl.textContent = `${update.confidence}%`;
    statusEl.classList.remove('live', 'estimated', 'offline');
    statusEl.classList.add(update.status);
    statusEl.textContent = update.status.toUpperCase();

    lastUpdateMap[busId] = update.lastUpdate || null;
    updateTimestampText(busId, update.lastUpdate);
  });
}

function attachLiveUpdates(busId) {
  try {
    const ref = db.ref(`liveLocation/${busId}`);
    const callback = (snapshot) => {
      const aggregated = aggregateLocations(snapshot);
      let update;

      if (!aggregated) {
        update = {
          confidence: 0,
          status: 'offline',
          lastUpdate: null
        };
      } else {
        const confidence = calculateConfidence(aggregated.numUsers, aggregated.variance);
        const status = determineStatus(aggregated.numUsers, confidence);
        update = {
          confidence,
          status,
          lastUpdate: aggregated.lastUpdate
        };
      }

      pendingUpdates[busId] = update;
      if (!rafScheduled) {
        rafScheduled = true;
        requestAnimationFrame(flushPendingUpdates);
      }
    };

    ref.on('value', callback);
    liveListeners[busId] = { ref, callback };
  } catch (error) {
    console.error('Live update listener error:', error);
    pendingUpdates[busId] = {
      confidence: 0,
      status: 'offline',
      lastUpdate: null
    };
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(flushPendingUpdates);
    }
  }
}

function filterAndDisplayBuses(buses) {
  let found = false;
  container.innerHTML = ""; // Clear loading state

  const fromKey = normalizeName(from);
  const toKey = normalizeName(to);
  
  console.log(`Filtering buses: from="${from}" (normalized: "${fromKey}") to="${to}" (normalized: "${toKey}")`);
  console.log("Total buses received:", buses.length);

  buses.forEach((bus, index) => {
    // Validate bus data structure - require route
    if (!Array.isArray(bus.route) || bus.route.length === 0) {
      console.warn(`Bus ${index} - Invalid bus data:`, bus);
      return;
    }

    const routeKeys = bus.route.map((r) => normalizeName(r));
    console.log(`Bus ${index} - Route:`, bus.route, "Normalized:", routeKeys);

    const fIndex = routeKeys.indexOf(fromKey);
    const tIndex = routeKeys.indexOf(toKey);
    
    console.log(`Bus ${index} - fromIndex: ${fIndex}, toIndex: ${tIndex}, fromKey: "${fromKey}", toKey: "${toKey}"`);

    if (fIndex === -1 || tIndex === -1 || fIndex >= tIndex) {
      console.log(`Bus ${index} - Skipped (fIndex=${fIndex}, tIndex=${tIndex}, fIndex>=tIndex=${fIndex >= tIndex})`);
      return;
    }

    // Generate id from route if not provided
    const busId = bus.id || `${bus.route[0]}–${bus.route[bus.route.length - 1]} `;
    const status = bus.status ? bus.status : 'estimated';

    const schedule = Array.isArray(bus.schedule)
      ? bus.schedule
      : (bus.time ? [bus.time] : []);
    
    // Show arrival time at destination (not departure)
    const displayTime = schedule.length > 0 && tIndex < schedule.length 
      ? schedule[tIndex] 
      : (schedule.length > 0 ? schedule[0] : 'N/A');
    
    const key = getOrCreateBusKey(busId);

    found = true;

    // Render bus card (existing HTML template)
    console.log(`Bus matching found! busId: "${busId}"`);
    container.innerHTML += `
      <div class="bus-card" data-bus-id="${busId}" data-bus-key="${key}">
        <div class="bus-info">
          <h3>${busId}</h3>
          <p>Route: ${from} → ${to}</p>
          <p>Arrival: ${displayTime}</p>
          <span class="status ${status}" data-bus-key="${key}">
            ${status.toUpperCase()}
          </span>
          <span class="confidence" id="conf-${key}">
            0%
          </span>
          <span class="last-update" id="update-${key}">--</span>
        </div>
        <button class="track-btn" data-bus-id="${busId}">
          Track
        </button>
      </div>
    `;

    attachLiveUpdates(busId);
  });

  console.log("=== Filter Summary ===");
  console.log("Buses found:", found);
  console.log("Total matched:", found ? "1+ buses" : "0 buses");

  if (!trackClickBound) {
    container.addEventListener('click', handleTrackClick);
    trackClickBound = true;
  }

  if (!found) {
    container.innerHTML = `
      <div class="no-data-message">
        <h3>🚌 No Buses Found</h3>
        <p>We couldn't find any buses matching your search criteria.</p>
        <ul>
          <li>Check if the route names are spelled correctly</li>
          <li>Try searching for nearby stations</li>
          <li>Some buses may not be active at this time</li>
        </ul>
        <button class="retry-btn" onclick="window.location.href='/HTML/index.html'">
          New Search
        </button>
      </div>
    `;
  } else if (!timestampIntervalId) {
    timestampIntervalId = setInterval(refreshAllTimestamps, 60000);
    staleCheckIntervalId = setInterval(checkForStaleUpdates, 30000);
  }
}


// Track
function trackBus(id) {
  window.location.href = "/HTML/track.html?bus=" + encodeURIComponent(id);
}

  // Later: redirect to map page

window.addEventListener('beforeunload', () => {
  Object.values(liveListeners).forEach(({ ref, callback }) => {
    ref.off('value', callback);
  });

  if (timestampIntervalId) {
    clearInterval(timestampIntervalId);
  }

  if (staleCheckIntervalId) {
    clearInterval(staleCheckIntervalId);
  }
});

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function handleTrackClick(event) {
  const button = event.target.closest('.track-btn');
  if (!button) return;

  const busId = button.getAttribute('data-bus-id');
  if (busId) trackBus(busId);
}

function createSafeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getOrCreateBusKey(busId) {
  if (busIdToKey.has(busId)) return busIdToKey.get(busId);

  const baseKey = createSafeKey(busId) || "bus";
  let key = baseKey;
  let suffix = 1;

  while (usedKeys.has(key)) {
    suffix += 1;
    key = `${baseKey}-${suffix}`;
  }

  usedKeys.add(key);
  busIdToKey.set(busId, key);
  return key;
}

function getBusKey(busId) {
  return busIdToKey.get(busId);
}

