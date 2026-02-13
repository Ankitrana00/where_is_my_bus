// Firebase CDN already loaded in HTML

// 🔴 Apna REAL config yahan paste kar
const firebaseConfig = {
  apiKey: "AIzaSyCCcAEpPZyhS9yZFIQBVBcSRxQWdrwDRXc",
    authDomain: "where-is-my-bus-941f0.firebaseapp.com",
    databaseURL: "https://where-is-my-bus-941f0-default-rtdb.firebaseio.com",
    projectId: "where-is-my-bus-941f0"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Enable offline persistence
try {
  firebase.database().ref('.info/connected').on('value', () => {
    // Connection established
  });

  // Enable disk persistence for offline support
  firebase.database.enableLogging(false); // Disable verbose logs in production

  console.log('✅ Offline persistence enabled');
} catch (error) {
  console.warn('Offline persistence not available:', error);
}

// Global Database
try {
  window.db = firebase.database();
  window.isFirebaseConnected = true;

  // Test connection (debounced to avoid flicker logs)
  let disconnectTimer = null;

  db.ref('.info/connected').on('value', (snapshot) => {
    const connected = snapshot.val() === true;
    window.isFirebaseConnected = connected;

    if (!connected) {
      if (disconnectTimer) clearTimeout(disconnectTimer);
      disconnectTimer = setTimeout(() => {
        if (window.isFirebaseConnected === false) {
          console.warn('Firebase connection lost');
        }
      }, 2000);
    } else {
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
    }
  });
} catch (error) {
  console.error('Firebase initialization error:', error);
  alert('Failed to connect to database. Please refresh the page.');
}

console.log("🔥 Firebase Connected:", window.db);
