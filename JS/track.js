
// Get bus name from URL
const params = new URLSearchParams(window.location.search);
const busId = params.get("bus");

if (busId) {
  document.getElementById("busName").innerText =
    "Tracking " + busId;
}


// Initialize Map
const map = L.map("map").setView([28.99, 77.02], 10);

// OpenStreetMap Layer
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);


// Bus Marker
let busMarker = L.marker([28.99, 77.02]).addTo(map);

function calculateVariance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
}

// Live location listener (average position)
if (busId) {
  db.ref(`liveLocation/${busId}`).on("value", (snapshot) => {
    const data = snapshot.val();

    if (!data) {
      updateConfidenceAndStatus(0, 0);
      return;
    }

    const locations = Object.values(data)
      .map((item) => ({
        lat: item.lat,
        lng: item.lng,
        time: item.time,
        accuracy: item.accuracy,
        age: (Date.now() - item.time) / 1000
      }))
      .filter((item) =>
        typeof item.lat === "number" &&
        typeof item.lng === "number" &&
        typeof item.time === "number" &&
        (typeof item.accuracy !== "number" || Number.isFinite(item.accuracy))
      );

    const now = Date.now();
    const STALE_THRESHOLD = 120000;

    const recentLocations = locations.filter(
      (item) => (now - item.time) <= STALE_THRESHOLD
    );

    console.log("Valid locations:", recentLocations.length);

    if (recentLocations.length === 0) {
      updateConfidenceAndStatus(0, 0);
      const fallbackLat = 28.99;
      const fallbackLng = 77.02;
      busMarker.setLatLng([fallbackLat, fallbackLng]);
      map.panTo([fallbackLat, fallbackLng]);
      return;
    }

    let sumLat = 0;
    let sumLng = 0;
    let totalWeight = 0;

    recentLocations.forEach((item) => {
      const recencyWeight = 1 / (1 + item.age / 60);
      const accuracyWeight = 1 / (item.accuracy || 50);
      const weight = recencyWeight * accuracyWeight;

      sumLat += item.lat * weight;
      sumLng += item.lng * weight;
      totalWeight += weight;
    });

    if (totalWeight === 0) {
      updateConfidenceAndStatus(0, 0);
      const fallbackLat = 28.99;
      const fallbackLng = 77.02;
      busMarker.setLatLng([fallbackLat, fallbackLng]);
      map.panTo([fallbackLat, fallbackLng]);
      return;
    }

    const avgLat = sumLat / totalWeight;
    const avgLng = sumLng / totalWeight;

    // Calculate variance for confidence
    const lats = recentLocations.map(loc => loc.lat);
    const lngs = recentLocations.map(loc => loc.lng);
    const latVariance = calculateVariance(lats);
    const lngVariance = calculateVariance(lngs);
    const totalVariance = latVariance + lngVariance;

    // Update UI with real confidence
    updateConfidenceAndStatus(recentLocations.length, totalVariance);

    console.log("Weighted position:", avgLat, avgLng, "Total weight:", totalWeight);

    if (!Number.isFinite(totalWeight) || !Number.isFinite(avgLat) || !Number.isFinite(avgLng)) {
      const fallbackLat = 28.99;
      const fallbackLng = 77.02;
      busMarker.setLatLng([fallbackLat, fallbackLng]);
      map.panTo([fallbackLat, fallbackLng]);
      return;
    }

    busMarker.setLatLng([avgLat, avgLng]);
    map.panTo([avgLat, avgLng]);
  });
}


// Demo Movement removed; Firebase listener drives marker updates.


// Join Bus Button
const joinBtn = document.getElementById("joinBtn");

// Unique user id (per device/session)
const userId = "user_" + Date.now();

joinBtn.addEventListener("click", () => {

  if (!navigator.geolocation) {
    alert("GPS not supported");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const busId = params.get("bus");

  if (!busId) {
    alert("Bus ID missing");
    return;
  }

  joinBtn.innerText = "Sharing...";
  joinBtn.disabled = true;

  navigator.geolocation.watchPosition(

    (pos) => {

      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const accuracy = pos.coords.accuracy || 50;
      const time = Date.now();

      console.log("Sending to Firebase:", lat, lng, accuracy);

      // 🔥 Send to Firebase
      db.ref("liveLocation/" + busId + "/" + userId).set({
        lat: lat,
        lng: lng,
        accuracy: accuracy,
        time: time
      });

    },

    (err) => {
      console.error(err);
      alert("Location error");
    },

    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }

  );

});



// Confidence Meter (Demo)
function updateConfidenceAndStatus(numUsers, variance) {
  const statusEl = document.getElementById("status");
  const confEl = document.getElementById("confidence");

  // Edge case: No users
  if (numUsers === 0) {
    statusEl.textContent = "Offline";
    statusEl.className = "status-offline";
    confEl.textContent = "0%";
    return;
  }

  // Calculate confidence: min(100, numUsers*10 + 50/(variance+1))
  const userScore = numUsers * 10;
  const varianceScore = 50 / (variance + 1);
  const confidence = Math.min(100, Math.round(userScore + varianceScore));

  confEl.textContent = confidence + "%";

  // Determine status based on confidence and recency
  if (numUsers >= 2 && confidence >= 70) {
    statusEl.textContent = "Live";
    statusEl.className = "status-live";
  } else if (numUsers === 1 || confidence >= 50) {
    statusEl.textContent = "Estimated";
    statusEl.className = "status-estimated";
  } else {
    statusEl.textContent = "Uncertain";
    statusEl.className = "status-offline";
  }
}

// Initialize UI to offline state
updateConfidenceAndStatus(0, 0);

