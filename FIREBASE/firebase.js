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

  firebase.database.enableLogging(false);

  console.log('Offline persistence enabled');
} catch (error) {
  console.warn('Offline persistence not available:', error);
}

// Global Database
try {
  window.db = firebase.database();

  // Test connection
  db.ref('.info/connected').on('value', (snapshot) => {
    if (snapshot.val() === false) {
      console.warn('Firebase connection lost');
    }
  });
} catch (error) {
  console.error('Firebase initialization error:', error);
  alert('Failed to connect to database. Please refresh the page.');
}

console.log("🔥 Firebase Connected:", window.db);
