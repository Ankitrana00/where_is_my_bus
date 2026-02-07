// Read URL Parameters
const params = new URLSearchParams(window.location.search);

const from = params.get("from");
const to = params.get("to");
const start = params.get("start");
const end = params.get("end");

// Show in console (test)
console.log("From:", from);
console.log("To:", to);
console.log("Time:", start, "-", end);

const container = document.querySelector(".container");

const liveListeners = {};
const lastUpdateMap = {};
const pendingUpdates = {};
let rafScheduled = false;
let timestampIntervalId = null;
let staleCheckIntervalId = null;

// Show loading state
container.innerHTML = `
  <div class="loading">
    <p>🔍 Searching for buses...</p>
  </div>
`;

// Before filtering, validate URL parameters
if (!from || !to || !start || !end) {
  container.innerHTML = `
    <p>⚠️ Missing search parameters. <a href="index.html">Go back</a></p>
  `;
} else {
  // Validate time format (HH:MM)
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(start) || !timeRegex.test(end)) {
    container.innerHTML = `
      <p>⚠️ Invalid time format. <a href="index.html">Go back</a></p>
    `;
  } else {
    const timeout = setTimeout(() => {
      container.innerHTML = `
        <p>⚠️ Request timed out. <button onclick="location.reload()">Retry</button></p>
      `;
    }, 10000);

    // Fetch buses from Firebase
    db.ref('buses').once('value')
      .then((snapshot) => {
        clearTimeout(timeout);
        const data = snapshot.val();

        if (!data || Object.keys(data).length === 0) {
          container.innerHTML = "<p>No buses available. Check back later.</p>";
          return;
        }

        // Convert Firebase object to array
        const buses = Object.values(data).filter(bus => bus.active !== false);

        // Apply existing filtering logic
        filterAndDisplayBuses(buses);
      })
      .catch((error) => {
        clearTimeout(timeout);
        console.error("Firebase error:", error);
        container.innerHTML = `
          <div class="error">
            <p>⚠️ Unable to load buses. Please check your connection.</p>
            <button onclick="location.reload()">Retry</button>
          </div>
        `;
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
  const updateEl = document.getElementById(`update-${busId}`);
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
    const confEl = document.getElementById(`conf-${busId}`);
    const statusEl = document.querySelector(`.status[data-bus-id="${busId}"]`);
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

  buses.forEach(bus => {
    // Validate bus data structure
    if (!bus.id || !Array.isArray(bus.route)) {
      console.warn("Invalid bus data:", bus);
      return;
    }

    const schedule = Array.isArray(bus.schedule)
      ? bus.schedule
      : (bus.time ? [bus.time] : []);

    // Route matching logic (existing)
    const fIndex = bus.route.indexOf(from);
    const tIndex = bus.route.indexOf(to);

    if (fIndex === -1 || tIndex === -1 || fIndex >= tIndex) return;

    // Time window filtering (existing)
    const matchedTime = schedule.find((time) => time >= start && time <= end);
    const status = bus.status ? bus.status : 'unknown';

    if (matchedTime) {
      found = true;

      // Render bus card (existing HTML template)
      container.innerHTML += `
        <div class="bus-card" data-bus-id="${bus.id}">
          <div class="bus-info">
            <h3>${bus.id}</h3>
            <p>Route: ${from} → ${to}</p>
            <p>Arrival: ${matchedTime}</p>
            <span class="status ${status}" data-bus-id="${bus.id}">
              ${status.toUpperCase()}
            </span>
            <span class="confidence" id="conf-${bus.id}">
              0%
            </span>
            <span class="last-update" id="update-${bus.id}">--</span>
          </div>
          <button class="track-btn" onclick="trackBus('${bus.id}')">
            Track
          </button>
        </div>
      `;

      attachLiveUpdates(bus.id);
    }
  });

  if (!found) {
    container.innerHTML = `
      <div class="no-data-message">
        <h3>🚌 No Buses Found</h3>
        <p>We couldn't find any buses matching your search criteria.</p>
        <ul>
          <li>Try adjusting your time window</li>
          <li>Check if the route names are spelled correctly</li>
          <li>Try searching for nearby stations</li>
          <li>Some buses may not be active at this time</li>
        </ul>
        <button class="retry-btn" onclick="window.location.href='index.html'">
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
  window.location.href = "track.html?bus=" + id;
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

