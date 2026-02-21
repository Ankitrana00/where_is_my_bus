
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

// Determine map center based on bus route starting point
let mapCenter = [28.99, 77.02]; // Default center (Delhi area)
let mapZoom = 10;

if (busId && ROUTES && ROUTES[busId]) {
  const route = ROUTES[busId];
  const firstStop = route.stops[0];
  if (firstStop) {
    mapCenter = [firstStop.lat, firstStop.lng];
    mapZoom = 10;
    console.log(`Map centered on ${busId} starting point:`, firstStop.name);
  }
}

// Initialize Map
const map = L.map("map").setView(mapCenter, mapZoom);

// OpenStreetMap Layer
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap"
}).addTo(map);


// Bus Marker - initialize at the route starting point (same as map center)
let busMarker = L.marker(mapCenter).addTo(map);

function calculateVariance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
}

// Rolling buffer to track recent location samples for consistency analysis
const recentLocationHistory = [];
const MAX_HISTORY = 5;

// Calculate great-circle distance between two GPS points in meters
function calculateGPSDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Evaluate location consistency from recent samples
function evaluateLocationConsistency(locations) {
  if (!locations || locations.length < 2) {
    return { consistencyScore: locations && locations.length === 1 ? 100 : 0 };
  }

  // Calculate pairwise distances between all points
  const distances = [];
  for (let i = 0; i < locations.length; i++) {
    for (let j = i + 1; j < locations.length; j++) {
      const dist = calculateGPSDistance(
        locations[i].lat, locations[i].lng,
        locations[j].lat, locations[j].lng
      );
      distances.push(dist);
    }
  }

  // If no distances calculated, return neutral score
  if (distances.length === 0) return { consistencyScore: 50 };

  // Calculate statistics on distances
  const avgDistance = distances.reduce((a, b) => a + b) / distances.length;
  const maxDistance = Math.max(...distances);
  const minDistance = Math.min(...distances);

  // Suspicious patterns detection
  let suspiciousFlag = false;

  // Flag 1: Single outlier very far from others (>500m away from rest)
  const farOutliers = distances.filter(d => d > 500).length;
  if (farOutliers > 0 && locations.length <= 3) {
    suspiciousFlag = true;
  }

  // Flag 2: Perfect clustering (all points identical) - unlikely unless stationary
  const clusteredCount = distances.filter(d => d < 5).length; // 5m threshold
  const totalPairs = (locations.length * (locations.length - 1)) / 2;
  const percentClustered = clusteredCount / totalPairs;
  
  // If stationary for many samples (>80% within 5m), consistency is good
  const isStationary = percentClustered > 0.8;

  // Scoring logic
  let consistencyScore = 100;

  // Perfect consistency (all within 5m) = 95 pts
  if (percentClustered === 1) {
    consistencyScore = isStationary ? 95 : 90;
  }
  // Good consistency (most points close, <1m avg) = 80-90
  else if (avgDistance < 10) {
    consistencyScore = 85;
  }
  // Moderate consistency (<50m avg) = 60-75
  else if (avgDistance < 50) {
    consistencyScore = 70;
  }
  // Poor consistency (50-200m) = 40-60
  else if (avgDistance < 200) {
    consistencyScore = 45;
  }
  // Very poor consistency (>200m) = 20-40
  else {
    consistencyScore = 25;
  }

  // Penalize suspicious patterns
  if (suspiciousFlag) {
    consistencyScore = Math.max(10, consistencyScore - 30);
  }

  return {
    consistencyScore: Math.round(consistencyScore),
    avgDistance: Math.round(avgDistance),
    maxDistance: Math.round(maxDistance),
    pointCount: locations.length,
    suspicious: suspiciousFlag
  };
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

// Track position source for accurate confidence display
let currentPositionSource = 'offline'; // Values: 'offline' | 'estimated' | 'live'

// Fallback positioning system - estimates bus position based on route schedule
function updateEstimatedPosition() {
  if (!busId || !ROUTES || !ROUTES[busId]) {
    return;
  }

  const route = ROUTES[busId];
  const now = new Date();
  const estimatedPos = window.getBusPosition(busId, now);

  if (!estimatedPos) {
    console.log("No estimated position available for", busId);
    return;
  }

  console.log(`Estimated position for ${busId}: ${estimatedPos.stopName} (${estimatedPos.lat}, ${estimatedPos.lng})`);
  
  busMarker.setLatLng([estimatedPos.lat, estimatedPos.lng]);
  
  // Update popup with stop name
  const popupText = `${busId}<br>📍 ${estimatedPos.stopName}`;
  busMarker.bindPopup(popupText);
  
  // Update confidence to show this is estimated (only if we don't have live GPS data)
  if (currentPositionSource !== 'live') {
    currentPositionSource = 'estimated';
    updateConfidenceAndStatus(0, 0, 'estimated');
  }
}

// Run estimated positioning every 10 seconds as fallback when no live data
let estimationIntervalId = null;
if (busId && ROUTES && ROUTES[busId]) {
  estimationIntervalId = setInterval(updateEstimatedPosition, 10000); // Update every 10 seconds for smooth progression
  updateEstimatedPosition(); // Initial call
}

// Live location listener (average position)

if (busId) {
  try {
    db.ref(`liveLocation/${busId}`).on("value",
      (snapshot) => {
        const data = snapshot.val();

        if (!data) {
          // No firebase data at all - if we have estimated position, keep showing it
          if (currentPositionSource === 'estimated') {
            console.log("No Firebase data, continuing with estimated position");
          } else {
            console.log("No Firebase data and no estimated position available");
            updateConfidenceAndStatus(0, 0);
          }
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
          // No live GPS data - keep using estimated position
          console.log("No recent live locations, keeping estimated position");
          // Don't reset confidence here - keep estimated or offline state
          // The updateEstimatedPosition() interval will handle showing estimated status
          showNoDataMessage();
          return;
        }

        hideNoDataMessage();

        // Track location history for consistency analysis
        const latestLocation = recentLocations[recentLocations.length - 1];
        if (latestLocation) {
          recentLocationHistory.push({
            lat: latestLocation.lat,
            lng: latestLocation.lng,
            time: latestLocation.time
          });
          
          // Keep only last 5 samples
          if (recentLocationHistory.length > MAX_HISTORY) {
            recentLocationHistory.shift();
          }
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
          // Calculation failed but we have live locations - keep estimated position
          console.log("Failed to calculate weighted position, keeping estimated position");
          // Keep current source state
          return;
        }

        const avgLat = sumLat / totalWeight;
        const avgLng = sumLng / totalWeight;

        const lats = recentLocations.map(loc => loc.lat);
        const lngs = recentLocations.map(loc => loc.lng);
        const latVariance = calculateVariance(lats);
        const lngVariance = calculateVariance(lngs);
        const totalVariance = latVariance + lngVariance;

        // Enhanced confidence calculation using all available metrics
        const confidence = calculateConfidenceScore(recentLocations, totalVariance);
        
        // Mark position source as live and update confidence
        currentPositionSource = 'live';
        updateConfidenceAndStatus(recentLocations.length, totalVariance, confidence);

        console.log("Weighted position:", avgLat, avgLng, "Total weight:", totalWeight);

        if (!Number.isFinite(totalWeight) || !Number.isFinite(avgLat) || !Number.isFinite(avgLng)) {
          // Invalid calculation - revert to estimated position state
          console.log("Invalid calculation result, reverting to estimated position");
          currentPositionSource = 'estimated';
          updateConfidenceAndStatus(0, 0, 'estimated');
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
const UPDATE_INTERVAL = 5000; // 5 seconds

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



// Enhanced Confidence Meter with multi-factor scoring + location consistency
// Factors: user count, GPS accuracy, data clustering, freshness, location consistency
function calculateConfidenceScore(locations, variance) {
  if (!locations || locations.length === 0) return 0;

  const now = Date.now();

  // Factor 1: User Count (logarithmic scaling - diminishing returns)
  // 1 user = 25 pts, 2 users = 40 pts, 3 users = 50 pts, 4+ = 60 pts max
  const userCountScore = Math.min(60, 20 + Math.log(locations.length + 1) * 15);

  // Factor 2: GPS Accuracy (inverse of average accuracy in meters)
  // 10m accuracy = 35 pts, 30m = 20 pts, 100m+ = 5 pts
  const avgAccuracy = locations.reduce((sum, loc) => sum + (loc.accuracy || 50), 0) / locations.length;
  const accuracyScore = Math.max(5, Math.min(35, 50 - avgAccuracy * 0.2));

  // Factor 3: Data Freshness (all points within 2min = full score, older = reduced)
  // Max age of 120 seconds gets 35 pts, older data = lower score
  const maxAge = Math.max(...locations.map(loc => loc.age || 0));
  const freshnessScore = Math.max(0, 35 - (maxAge / 120000) * 35);

  // Factor 4: Data Clustering/Variance (low variance = good agreement)
  // Variance < 0.001 = 30 pts, Variance > 0.1 = 5 pts
  const clusteringScore = Math.max(5, Math.min(30, 30 - variance * 200));

  // Factor 5: Location Consistency (NEW - detect spoofing/proxy locations)
  // Evaluate consistency of recent location history
  const consistencyAnalysis = evaluateLocationConsistency(recentLocationHistory);
  let consistencyScore = Math.round(consistencyAnalysis.consistencyScore * 0.3); // Weight at 30 points max
  
  // High penalty for suspicious patterns (spoof detection)
  if (consistencyAnalysis.suspicious) {
    consistencyScore = Math.max(0, consistencyScore - 15);
  }

  // Total: Cap at 100
  const totalScore = Math.min(100, Math.round(
    userCountScore + 
    accuracyScore + 
    freshnessScore + 
    clusteringScore + 
    consistencyScore
  ));

  console.log(`Confidence breakdown - Users: ${userCountScore.toFixed(0)}, Accuracy: ${accuracyScore.toFixed(0)}, Freshness: ${freshnessScore.toFixed(0)}, Clustering: ${clusteringScore.toFixed(0)}, Consistency: ${consistencyScore.toFixed(0)} = Total: ${totalScore}` + (consistencyAnalysis.suspicious ? ' [⚠️ SUSPICIOUS]' : ''));

  return totalScore;
}

function updateConfidenceAndStatus(numUsers, variance, modeOrConfidence = 0) {
  const statusEl = document.getElementById("status");
  const confEl = document.getElementById("confidence");
  const spinner = statusEl.querySelector('.loading-spinner');
  const statusText = statusEl.querySelector('.status-text');

  // Handle estimated mode (displayed when showing position from schedule, not live GPS)
  if (modeOrConfidence === 'estimated') {
    if (spinner) spinner.style.display = 'none';
    if (statusText) statusText.textContent = "Estimated";
    statusEl.className = "status-estimated";
    confEl.textContent = "~%";
    return;
  }

  // Convert to numeric confidence value
  const confidence = typeof modeOrConfidence === 'number' ? modeOrConfidence : 0;

  if (numUsers === 0 && variance === 0) {
    if (spinner) spinner.style.display = 'inline';
  } else {
    if (spinner) spinner.style.display = 'none';
  }

  // Edge case: No users and not in estimated mode
  if (numUsers === 0) {
    if (statusText) statusText.textContent = "Offline";
    statusEl.className = "status-offline";
    confEl.textContent = "0%";
    return;
  }

  confEl.textContent = confidence + "%";

  // Determine status based on confidence level
  if (confidence >= 70) {
    if (statusText) statusText.textContent = "Live";
    statusEl.className = "status-live";
  } else if (confidence >= 50) {
    if (statusText) statusText.textContent = "Estimated";
    statusEl.className = "status-estimated";
  } else {
    if (statusText) statusText.textContent = "Uncertain";
    statusEl.className = "status-offline";
  }
}

// Initialize UI to offline state
updateConfidenceAndStatus(0, 0, 0); 
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
  if (estimationIntervalId) {
    clearInterval(estimationIntervalId);
  }
  db.ref('.info/connected').off();
  if (busId) {
    db.ref(`liveLocation/${busId}`).off();
  }
});

