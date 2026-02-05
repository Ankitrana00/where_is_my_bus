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

// Global Database
window.db = firebase.database();

console.log("🔥 Firebase Connected:", window.db);
