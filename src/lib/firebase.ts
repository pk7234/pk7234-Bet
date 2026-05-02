import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDaop8dIauOmuiQn5tAFnRS9yflmHgYdWU",
  authDomain: "aviator-fe35c.firebaseapp.com",
  projectId: "aviator-fe35c",
  storageBucket: "aviator-fe35c.firebasestorage.app",
  messagingSenderId: "107662801014",
  appId: "1:107662801014:web:f4ca9571e5ae65229b8757",
  measurementId: "G-T5J56RV4SD"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
