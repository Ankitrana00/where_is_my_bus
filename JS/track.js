
/**
 * PRODUCTION OPTIMIZATIONS:
 * - GPS updates debounced to max 1 per 5 seconds
 * - Location data auto-cleaned after 1 hour
 * - Firebase offline persistence enabled
 * - Security rules enforce data validation
 * - Database indexed on 'time' field for performance
 *
 * FIREBASE CONSOLE SETUP REQUIRED:
 * 1. Deploy firebase-rules.json to Database Rules
 * 2. Monitor usage in Firebase Console -> Usage tab
 * 3. Set up billing alerts for production
 */

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

function showErrorPanel(message, showRetry = false, retryCallback = null) {
  const existing = document.querySelector('.error-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.className = 'error-panel';

  const text = document.createElement('p');
  text.textContent = message;
  panel.appendChild(text);

  if (showRetry && retryCallback) {
    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Retry';
    retryBtn.onclick = retryCallback;
    panel.appendChild(retryBtn);
  }

  const infoPanel = document.querySelector('.info-panel');
  infoPanel.insertAdjacentElement('afterend', panel);
}

function hideErrorPanel() {
  const panel = document.querySelector('.error-panel');
  if (panel) panel.remove();
}

function showNoDataMessage() {
  const existing = document.querySelector('.no-data-message');
  if (existing) return;

  const message = document.createElement('div');
  message.className = 'no-data-message';
  message.innerHTML = `
    <h3>📍 No Live Location Data</h3>
    <p>This bus doesn't have any active location sharing right now.</p>
    <ul>
      <li>Be the first to share your location if you're on this bus</li>
      <li>Check back in a few minutes</li>
      <li>Try a different bus from the list</li>
    </ul>
  `;

  const map = document.getElementById('map');
  map.insertAdjacentElement('beforebegin', message);
}

function hideNoDataMessage() {
  const message = document.querySelector('.no-data-message');
  if (message) message.remove();
}

// Monitor Firebase connection
let isFirebaseConnected = true;
let reconnectAttempts = 0;
const MAX_RECONNECT = 5;

db.ref('.info/connected').on('value', (snapshot) => {
  isFirebaseConnected = snapshot.val() === true;

  if (!isFirebaseConnected) {
    reconnectAttempts++;
    showErrorPanel(
      `Connection lost. Reconnecting... (${reconnectAttempts}/${MAX_RECONNECT})`,
      reconnectAttempts >= MAX_RECONNECT
    );
    updateConfidenceAndStatus(0, 0);
  } else {
    reconnectAttempts = 0;
    hideErrorPanel();
    console.log('Firebase reconnected');
    if (lastPositionPayload) {
      writeRetryCount = 0;
      writeLocationWithRetry(lastPositionPayload);
    }
  }
});

// Live location listener (average position)
if (busId) {
  try {
    db.ref(`liveLocation/${busId}`).on("value",
      (snapshot) => {
        const data = snapshot.val();

        if (!data) {
          updateConfidenceAndStatus(0, 0);
          showNoDataMessage();
          return;
        }

        hideNoDataMessage();

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

        const lats = recentLocations.map(loc => loc.lat);
        const lngs = recentLocations.map(loc => loc.lng);
        const latVariance = calculateVariance(lats);
        const lngVariance = calculateVariance(lngs);
        const totalVariance = latVariance + lngVariance;

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
      },
      (error) => {
        console.error('Firebase listener error:', error);
        showErrorPanel(
          'Unable to load bus location. Please check your connection.',
          true,
          () => window.location.reload()
        );
        updateConfidenceAndStatus(0, 0);
      }
    );
  } catch (error) {
    console.error('Failed to attach listener:', error);
    showErrorPanel(
      'Failed to initialize tracking. Please try again.',
      true,
      () => window.location.reload()
    );
  }
} else {
  showErrorPanel(
    'Bus ID is missing. Please select a bus from the list.',
    false
  );
  document.getElementById('busName').textContent = 'Invalid Bus';
}

// Cleanup old location data (>1 hour)
function cleanupOldLocations() {
  if (!busId) return;

  const oneHourAgo = Date.now() - 3600000;

  db.ref(`liveLocation/${busId}`).once('value', (snapshot) => {
    const updates = {};

    snapshot.forEach((child) => {
      const data = child.val();
      if (data && data.time < oneHourAgo) {
        updates[child.key] = null;
      }
    });

    if (Object.keys(updates).length > 0) {
      db.ref(`liveLocation/${busId}`).update(updates)
        .then(() => {
          console.log(`Cleaned ${Object.keys(updates).length} old locations`);
          showCleanupNotice(Object.keys(updates).length);
        })
        .catch(err => console.error('Cleanup error:', err));
    }
  });
}

// Run cleanup every 10 minutes
setInterval(cleanupOldLocations, 600000);
cleanupOldLocations();


// Demo Movement removed; Firebase listener drives marker updates.


// Join Bus Button
const joinBtn = document.getElementById("joinBtn");

// Unique user id (per device/session)
const userId = "user_" + Date.now();
let lastUpdateTime = 0;
const UPDATE_INTERVAL = 5000;

let locationWatchId = null;
let retryCount = 0;
const MAX_RETRIES = 3;
let writeRetryCount = 0;
const MAX_WRITE_RETRIES = 3;
let lastPositionPayload = null;

function showCleanupNotice(count) {
  const existing = document.querySelector('.error-panel');
  if (existing) return;

  showErrorPanel(`Cleaned ${count} old locations.`, false);
  setTimeout(() => {
    hideErrorPanel();
  }, 3000);
}

function writeLocationWithRetry(payload) {
  if (!payload || !busId) return;

  const attemptWrite = () => {
    db.ref("liveLocation/" + busId + "/" + userId)
      .set(payload)
      .catch((error) => {
        writeRetryCount += 1;
        console.error('Firebase write error:', error);

        if (writeRetryCount <= MAX_WRITE_RETRIES) {
          showErrorPanel(
            `Failed to update location. Retrying (${writeRetryCount}/${MAX_WRITE_RETRIES})...`,
            false
          );
          const delay = 1000 * writeRetryCount;
          setTimeout(attemptWrite, delay);
        } else {
          showErrorPanel(
            'Failed to update location. Please check your connection.',
            true,
            () => {
              writeRetryCount = 0;
              attemptWrite();
            }
          );
        }
      });
  };

  attemptWrite();
}

joinBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showErrorPanel('GPS is not supported on this device', false);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const busId = params.get("bus");

  if (!busId) {
    showErrorPanel('Bus ID missing. Cannot share location.', false);
    return;
  }

  joinBtn.innerText = "Requesting GPS...";
  joinBtn.disabled = true;

  function startLocationSharing() {
    if (locationWatchId) {
      navigator.geolocation.clearWatch(locationWatchId);
    }

    locationWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        retryCount = 0;
        hideErrorPanel();

        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy || 50;
        const time = Date.now();

        const now = Date.now();
        if (now - lastUpdateTime < UPDATE_INTERVAL) {
          return;
        }
        lastUpdateTime = now;

        console.log("Sending to Firebase:", lat, lng, accuracy);

        joinBtn.innerText = "Sharing Location ✓";

        lastPositionPayload = { lat, lng, accuracy, time };
        writeRetryCount = 0;
        writeLocationWithRetry(lastPositionPayload);
      },
      (error) => {
        let errorMessage = '';
        let canRetry = false;

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable GPS in your browser settings.';
            joinBtn.innerText = "Permission Denied";
            break;

          case error.POSITION_UNAVAILABLE:
            errorMessage = 'GPS signal unavailable. Make sure you\'re not indoors or in a tunnel.';
            canRetry = true;
            joinBtn.innerText = "GPS Unavailable";
            break;

          case error.TIMEOUT:
            errorMessage = 'GPS request timed out. Retrying...';
            canRetry = true;
            joinBtn.innerText = "GPS Timeout";
            break;

          default:
            errorMessage = 'Unknown GPS error occurred.';
            canRetry = true;
            joinBtn.innerText = "GPS Error";
        }

        console.error('GPS Error:', error);

        if (canRetry && retryCount < MAX_RETRIES) {
          retryCount++;
          showErrorPanel(
            `${errorMessage} (Attempt ${retryCount}/${MAX_RETRIES})`,
            true,
            () => {
              hideErrorPanel();
              retryCount = 0;
              startLocationSharing();
            }
          );

          setTimeout(() => {
            if (retryCount > 0 && retryCount < MAX_RETRIES) {
              startLocationSharing();
            }
          }, 3000);
        } else {
          showErrorPanel(errorMessage, canRetry, () => {
            hideErrorPanel();
            retryCount = 0;
            joinBtn.disabled = false;
            joinBtn.innerText = "🚍 Inside This Bus";
          });
          joinBtn.disabled = false;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  startLocationSharing();
});



// Confidence Meter (Demo)
function updateConfidenceAndStatus(numUsers, variance) {
  const statusEl = document.getElementById("status");
  const confEl = document.getElementById("confidence");
  const spinner = statusEl.querySelector('.loading-spinner');
  const statusText = statusEl.querySelector('.status-text');

  if (numUsers === 0 && variance === 0) {
    if (spinner) spinner.style.display = 'inline';
  } else {
    if (spinner) spinner.style.display = 'none';
  }

  // Edge case: No users
  if (numUsers === 0) {
    if (statusText) statusText.textContent = "Offline";
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
    if (statusText) statusText.textContent = "Live";
    statusEl.className = "status-live";
  } else if (numUsers === 1 || confidence >= 50) {
    if (statusText) statusText.textContent = "Estimated";
    statusEl.className = "status-estimated";
  } else {
    if (statusText) statusText.textContent = "Uncertain";
    statusEl.className = "status-offline";
  }
}

// Initialize UI to offline state
updateConfidenceAndStatus(0, 0);
// jab user offline ho jaye ya tab band karde tab uska dta firebase se delete karne ke liye 
window.onbeforeunload = () => {

  if (busId && userId) {

    db.ref("liveLocation/" + busId + "/" + userId).remove();

    console.log("User removed from Firebase");
  }

};


// Detect offline mode
window.addEventListener('online', () => {
  hideErrorPanel();
  console.log('Connection restored');
});

window.addEventListener('offline', () => {
  showErrorPanel(
    'You are offline. Location updates are paused.',
    false
  );
});

if (!navigator.onLine) {
  showErrorPanel('You are offline. Please check your internet connection.', false);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (locationWatchId) {
    navigator.geolocation.clearWatch(locationWatchId);
  }
  db.ref('.info/connected').off();
  if (busId) {
    db.ref(`liveLocation/${busId}`).off();
  }
});

