const firebaseConfig = {
  apiKey: "AIzaSyC96_JK4gQ0Y4HRC_E_bF_swfY8lvx8mgU",
  authDomain: "sales-followup-anon-board.firebaseapp.com",
  projectId: "sales-followup-anon-board",
  storageBucket: "sales-followup-anon-board.firebasestorage.app",
  messagingSenderId: "233769774854",
  appId: "1:233769774854:web:923915f4cd276aa01bb887"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
