import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc,
  query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebaseClient';

const REPORTS = 'reports';

export async function createReport(uid, data) {
  const ref = await addDoc(collection(db, REPORTS), {
    ...data,
    ownerId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateReport(id, data) {
  await setDoc(doc(db, REPORTS, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function getReport(id) {
  const snap = await getDoc(doc(db, REPORTS, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listReports(uid) {
  const q = query(collection(db, REPORTS), where('ownerId', '==', uid), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteReport(id) {
  await deleteDoc(doc(db, REPORTS, id));
}
