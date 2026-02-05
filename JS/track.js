
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

// Live location listener (average position)
if (busId) {
  db.ref(`liveLocation/${busId}`).on("value", (snapshot) => {
    const data = snapshot.val();

    if (!data) {
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
        typeof item.lng === "number"
      );

    const now = Date.now();
    const STALE_THRESHOLD = 120000;

    const recentLocations = locations.filter(
      (item) => (now - item.time) <= STALE_THRESHOLD
    );

    console.log("Valid locations:", recentLocations.length);

    if (recentLocations.length === 0) {
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
      const fallbackLat = 28.99;
      const fallbackLng = 77.02;
      busMarker.setLatLng([fallbackLat, fallbackLng]);
      map.panTo([fallbackLat, fallbackLng]);
      return;
    }

    const avgLat = sumLat / totalWeight;
    const avgLng = sumLng / totalWeight;

    console.log("Weighted position:", avgLat, avgLng, "Total weight:", totalWeight);

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
function updateConfidence() {

  let conf = Math.floor(60 + Math.random() * 35);

  document.getElementById("confidence").innerText =
    conf + "%";
}

