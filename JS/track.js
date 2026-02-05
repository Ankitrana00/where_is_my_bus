
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


// Demo Movement (Simulation)
let lat = 28.99;
let lng = 77.02;

setInterval(() => {

  lat += (Math.random() - 0.5) * 0.01;
  lng += (Math.random() - 0.5) * 0.01;

  busMarker.setLatLng([lat, lng]);
  map.panTo([lat, lng]);

  updateConfidence();

}, 4000);


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
      const time = Date.now();

      console.log("Sending to Firebase:", lat, lng);

      // 🔥 Send to Firebase
      db.ref("liveLocation/" + busId + "/" + userId).set({
        lat: lat,
        lng: lng,
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

