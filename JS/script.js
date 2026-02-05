// Select Location Button
const locationBtn = document.querySelector(".btn-location");

let watchId = null;

// When button clicked
locationBtn.addEventListener("click", () => {

  // Check if browser supports GPS
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }

  // Ask user permission and start tracking
  watchId = navigator.geolocation.watchPosition(
    successLocation,
    errorLocation,
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );

  locationBtn.innerText = "📡 Sharing Location...";
  locationBtn.disabled = true;
});


// Success Callback (When location received)
function successLocation(position) {

  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const accuracy = position.coords.accuracy;

  console.log("Latitude:", lat);
  console.log("Longitude:", lng);
  console.log("Accuracy (meters):", accuracy);

  // For now just show alert (later send to Firebase)
  console.log("Location Updated Successfully");
}


// Error Callback
function errorLocation(error) {

  let msg = "";

  switch (error.code) {
    case error.PERMISSION_DENIED:
      msg = "Please allow location access.";
      break;
    case error.POSITION_UNAVAILABLE:
      msg = "Location not available.";
      break;
    case error.TIMEOUT:
      msg = "Location request timed out.";
      break;
    default:
      msg = "Unknown error.";
  }

  alert(msg);

  // Reset button
  locationBtn.innerText = "📍 Share My Location";
  locationBtn.disabled = false;
}
function goToBusList() {

  const from = document.getElementById("from").value.trim();
  const to = document.getElementById("to").value.trim();

  const start = document.getElementById("startTime").value;
  const end = document.getElementById("endTime").value;

  if (!from || !to || !start || !end) {
    alert("Please fill all fields");
    return;
  }

  // Create URL with parameters
  const url = `buslist.html?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&start=${start}&end=${end}`;

  // Redirect
  window.location.href = url;
}


