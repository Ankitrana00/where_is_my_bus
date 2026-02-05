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

// Demo bus data (later Firebase)
const buses = [
  {
    id: "Bus-101",
    route: ["Delhi","Sonipat","Panipat","Karnal","Ambala"],
    time: "09:15",
    confidence: 82,
    status: "live"
  },

  {
    id: "Bus-202",
    route: ["Delhi","Sonipat","Panipat","Ambala"],
    time: "09:40",
    confidence: 65,
    status: "estimated"
  },

  {
    id: "Bus-303",
    route: ["Delhi","Sonipat","Karnal","Ambala"],
    time: "08:50",
    confidence: 40,
    status: "offline"
  }
];


// Filter + Show
const container = document.querySelector(".container");

let found = false;

buses.forEach(bus => {

  const fIndex = bus.route.indexOf(from);
  const tIndex = bus.route.indexOf(to);

  if (fIndex === -1 || tIndex === -1 || fIndex >= tIndex) return;

  if (bus.time >= start && bus.time <= end) {

    found = true;

    container.innerHTML += `
      <div class="bus-card">

        <div class="bus-info">
          <h3>${bus.id}</h3>

          <p>Route: ${from} → ${to}</p>
          <p>Arrival: ${bus.time}</p>

          <span class="status ${bus.status}">
            ${bus.status.toUpperCase()}
          </span>

          <span class="confidence">
            ${bus.confidence}% Accurate
          </span>
        </div>

        <button class="track-btn"
          onclick="trackBus('${bus.id}')">
          Track
        </button>

      </div>
    `;
  }

});


if (!found) {
  container.innerHTML = "<p>No buses found for this route/time.</p>";
}


// Track
function trackBus(id) {
  window.location.href = "track.html?bus=" + id;
}

  // Later: redirect to map page

