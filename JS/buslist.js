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
        <div class="bus-card">
          <div class="bus-info">
            <h3>${bus.id}</h3>
            <p>Route: ${from} → ${to}</p>
            <p>Arrival: ${matchedTime}</p>
            <span class="status ${status}">
              ${status.toUpperCase()}
            </span>
            <span class="confidence" id="conf-${bus.id}">
              Loading...
            </span>
          </div>
          <button class="track-btn" onclick="trackBus('${bus.id}')">
            Track
          </button>
        </div>
      `;
    }
  });

  if (!found) {
    container.innerHTML = "<p>No buses found for this route/time.</p>";
  }
}


// Track
function trackBus(id) {
  window.location.href = "track.html?bus=" + id;
}

  // Later: redirect to map page

