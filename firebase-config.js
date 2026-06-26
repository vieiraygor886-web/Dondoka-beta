import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaByOuiwVC64P37MZgi7b1AVoH70H130z0MyE",
  authDomain: "agenda-salao-436b1.firebaseapp.com",
  projectId: "agenda-salao-436b1",
  storageBucket: "agenda-salao-436b1.firebasestorage.app",
  messagingSenderId: "1092286918194",
  appId: "1:1092286918194:web:7209630a920aa63a886626"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
