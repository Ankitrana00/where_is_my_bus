// Select Location Button
const locationBtn = document.querySelector(".btn-location");
let watchId = null;

function startSharing() {
  if (!locationBtn) return;

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
}

if (locationBtn) {
  locationBtn.addEventListener("click", startSharing);
}

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

// Validation Helpers
function validateRouteName(name) {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Route name cannot be empty" };
  }
  if (name.trim().length < 2) {
    return { valid: false, error: "Route name too short (min 2 characters)" };
  }
  if (name.trim().length > 50) {
    return { valid: false, error: "Route name too long (max 50 characters)" };
  }
  if (!/^[a-zA-Z0-9\s\-]+$/.test(name)) {
    return { valid: false, error: "Only letters, numbers, spaces, and hyphens allowed" };
  }
  return { valid: true };
}

function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  const parent = field.parentElement;

  field.classList.add('input-error');

  const existingError = parent.querySelector('.error-text');
  if (existingError) existingError.remove();

  const errorText = document.createElement('span');
  errorText.className = 'error-text';
  errorText.textContent = message;
  parent.appendChild(errorText);
}

function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  const parent = field.parentElement;

  field.classList.remove('input-error');
  const errorText = parent.querySelector('.error-text');
  if (errorText) errorText.remove();
}

function clearAllErrors() {
  ['from', 'to'].forEach(clearFieldError);
}
function goToBusList() {
  clearAllErrors();

  const from = document.getElementById("from").value.trim();
  const to = document.getElementById("to").value.trim();

  let hasError = false;

  const fromValidation = validateRouteName(from);
  if (!fromValidation.valid) {
    showFieldError('from', fromValidation.error);
    hasError = true;
  }

  const toValidation = validateRouteName(to);
  if (!toValidation.valid) {
    showFieldError('to', toValidation.error);
    hasError = true;
  }

  if (from.toLowerCase() === to.toLowerCase() && from && to) {
    showFieldError('to', 'Destination must be different from source');
    hasError = true;
  }

  if (hasError) return;

  const url = `/HTML/buslist.html?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  window.location.href = url;
}

// Real-time validation on input
document.getElementById('from').addEventListener('blur', function() {
  const validation = validateRouteName(this.value.trim());
  if (!validation.valid) {
    showFieldError('from', validation.error);
  } else {
    clearFieldError('from');
  }
});

document.getElementById('to').addEventListener('blur', function() {
  const validation = validateRouteName(this.value.trim());
  if (!validation.valid) {
    showFieldError('to', validation.error);
  } else {
    clearFieldError('to');
  }
});


