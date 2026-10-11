const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const crypto = require('crypto');
initializeApp();
const db = getFirestore();

function safeId(value) {
  const id = String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  if (!id) throw new HttpsError('invalid-argument', 'A valid ID is required.');
  return id;
}
async function requireAdmin(uid) {
  if (!uid) throw new HttpsError('unauthenticated', 'Please sign in first.');
  const snap = await db.doc(`admins/${uid}`).get();
  if (!snap.exists || snap.data().active !== true) {
    throw new HttpsError('permission-denied', 'This account is not an approved admin.');
  }
}
function normalizeQuestion(q, i) {
  if (!q || typeof q.question !== 'string' || !q.question.trim() || !Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim()) || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3) {
    throw new HttpsError('invalid-argument', `Question ${i + 1} must have text, four options and correctIndex 0–3.`);
  }
  return { question: q.question.trim().slice(0, 2000), options: q.options.map(o => o.trim().slice(0, 500)), correctIndex: q.correctIndex };
}
function normalizeSettings(s = {}) {
  const integer = (v, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Math.floor(Number(v)) : fallback));
  return {
    questionLimit: integer(s.questionLimit, 10, 1, 100),
    secondsPerQuestion: integer(s.secondsPerQuestion, 15, 5, 180),
    pointsPerCorrect: integer(s.pointsPerCorrect, 10, 1, 100),
    speedBonus: integer(s.speedBonus, 0, 0, 50),
    maxParticipants: integer(s.maxParticipants, 30, 2, 500),
    randomQuestions: s.randomQuestions !== false,
    randomOptions: s.randomOptions !== false
  };
}

// Lightweight permission check used by the admin UI.
exports.checkAdmin = onCall(async request => {
  await requireAdmin(request.auth?.uid);
  return {active: true};
});

// Saves quiz metadata and replaces its question bank. Only approved admins can call it.
exports.createQuiz = onCall(async request => {
  await requireAdmin(request.auth?.uid);
  const data = request.data || {};
  const id = safeId(data.quizId);
  const name = String(data.name || '').trim();
  if (!name || name.length > 120 || !Array.isArray(data.questions) || data.questions.length < 1 || data.questions.length > 400) {
    throw new HttpsError('invalid-argument', 'Quiz name and 1–400 questions are required.');
  }
  const questions = data.questions.map(normalizeQuestion);
  const settings = normalizeSettings(data.settings);
  if (settings.questionLimit > questions.length) throw new HttpsError('failed-precondition', 'Question limit cannot exceed the number of saved questions.');
  const quizRef = db.doc(`quizzes/${id}`);
  const existing = await quizRef.get();
  if (existing.exists && ['live', 'completed'].includes(existing.data().status)) {
    throw new HttpsError('failed-precondition', 'A live or completed quiz cannot be overwritten. Use a new Quiz Code.');
  }
  const oldBank = await db.collection('questionBanks').where('quizId', '==', id).get();
  const batch = db.batch();
  oldBank.docs.forEach(d => batch.delete(d.ref));
  batch.set(quizRef, {
    name, status: 'waiting', public: true, settings, questionCount: questions.length,
    createdBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp(),
    ...(existing.exists ? {} : {createdAt: FieldValue.serverTimestamp()})
  }, {merge: true});
  questions.forEach((q, i) => batch.set(db.doc(`questionBanks/${id}_${String(i).padStart(4, '0')}`), {
    quizId: id, order: i, question: q.question, options: q.options, correctIndex: q.correctIndex, active: true
  }));
  await batch.commit();
  return {quizId: id, status: 'waiting', questionCount: questions.length};
});

exports.startQuiz = onCall(async request => {
  await requireAdmin(request.auth?.uid);
  const id = safeId(request.data?.quizId);
  const quizRef = db.doc(`quizzes/${id}`);
  const quizSnap = await quizRef.get();
  if (!quizSnap.exists) throw new HttpsError('not-found', 'Quiz not found. Save the quiz first.');
  const quiz = quizSnap.data();
  if (quiz.status !== 'waiting') throw new HttpsError('failed-precondition', 'Quiz must be in waiting status.');
  const bankSnap = await db.collection('questionBanks').where('quizId', '==', id).where('active', '==', true).get();
  const settings = quiz.settings || {};
  if (bankSnap.size < Number(settings.questionLimit || 10)) throw new HttpsError('failed-precondition', 'Not enough questions in the question bank.');
  const pool = bankSnap.docs.map(d => ({id: d.id, ...d.data()}));
  // Fisher–Yates shuffle, never Math.random sort.
  for (let i = pool.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const selected = pool.slice(0, Number(settings.questionLimit || 10));
  const roundId = crypto.randomUUID();
  const batch = db.batch();
  batch.set(db.doc(`rounds/${roundId}`), {quizId: id, roundNumber: 1, status: 'live', questionCount: selected.length, startedAt: FieldValue.serverTimestamp()});
  selected.forEach((q, order) => {
    let options = [...q.options], correctIndex = q.correctIndex;
    if (settings.randomOptions) {
      const correct = options[correctIndex];
      for (let i = options.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [options[i], options[j]] = [options[j], options[i]]; }
      correctIndex = options.indexOf(correct);
    }
    // Public assignment never contains the answer key.
    batch.set(db.doc(`questionAssignments/${roundId}_${order}`), {quizId: id, roundId, questionId: q.id, order, question: q.question, options});
    batch.set(db.doc(`assignmentKeys/${roundId}_${order}`), {quizId: id, roundId, order, correctIndex, questionId: q.id});
  });
  batch.update(quizRef, {status: 'live', activeRoundId: roundId, startedAt: FieldValue.serverTimestamp()});
  await batch.commit();
  return {roundId, questionCount: selected.length};
});

exports.endQuiz = onCall(async request => {
  await requireAdmin(request.auth?.uid);
  const id = safeId(request.data?.quizId);
  const ref = db.doc(`quizzes/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Quiz not found.');
  if (snap.data().status === 'completed') return {quizId: id, status: 'completed'};
  await ref.update({status: 'completed', endedAt: FieldValue.serverTimestamp(), endedBy: request.auth.uid});
  return {quizId: id, status: 'completed'};
});

exports.joinQuiz = onCall(async request => {
  const uid = request.auth?.uid;
  const email = String(request.auth?.token?.email || '').trim().toLowerCase();
  if (!uid || !email || request.auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in with a verified email address first.');
  const {quizId, displayName, accessCode} = request.data || {};
  const id = safeId(quizId);
  const name = String(displayName || '').trim();
  if (!name || name.length > 40) throw new HttpsError('invalid-argument', 'Enter a name between 1 and 40 characters.');
  const quizRef = db.doc(`quizzes/${id}`), participantRef = db.doc(`participants/${id}_${uid}`);
  const allowRef = db.doc(`quizAccess/${id}_${uid}`);
  const result = await db.runTransaction(async tx => {
    const [qs, ps, access] = await Promise.all([tx.get(quizRef), tx.get(participantRef), tx.get(allowRef)]);
    if (!qs.exists || !['waiting', 'live'].includes(qs.data().status)) throw new HttpsError('failed-precondition', 'Quiz is not accepting players.');
    if (!access.exists || access.data().active !== true || String(access.data().email || '').toLowerCase() !== email) throw new HttpsError('permission-denied', 'This email has not been approved for this quiz.');
    if (accessCode && access.data().codeHash !== crypto.createHash('sha256').update(String(accessCode)).digest('hex')) throw new HttpsError('permission-denied', 'Invalid access code.');
    if (!ps.exists) {
      const count = await tx.get(db.collection('participants').where('quizId', '==', id));
      if (count.size >= Number(qs.data().settings?.maxParticipants || 30)) throw new HttpsError('resource-exhausted', 'Quiz is full.');
      tx.set(participantRef, {quizId: id, authUid: uid, email, displayName: name, score: 0, joinedAt: FieldValue.serverTimestamp(), status: 'joined'});
    }
    return {quizId: id, participantId: participantRef.id, status: qs.data().status, roundId: qs.data().activeRoundId || null};
  });
  return result;
});

exports.getAssignedQuestion = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const id = safeId(request.data?.quizId), roundId = safeId(request.data?.roundId);
  const order = Number(request.data?.questionOrder);
  if (!Number.isInteger(order) || order < 0) throw new HttpsError('invalid-argument', 'Invalid question order.');
  const [quizSnap, participantSnap, questionSnap] = await Promise.all([
    db.doc(`quizzes/${id}`).get(), db.doc(`participants/${id}_${uid}`).get(), db.doc(`questionAssignments/${roundId}_${order}`).get()
  ]);
  if (!quizSnap.exists || quizSnap.data().status !== 'live' || quizSnap.data().activeRoundId !== roundId) throw new HttpsError('failed-precondition', 'Quiz is not live.');
  if (!participantSnap.exists || !questionSnap.exists) throw new HttpsError('permission-denied', 'You are not assigned to this quiz/question.');
  const q = questionSnap.data();
  return {question: q.question, options: q.options, order: q.order, questionCount: Number(quizSnap.data().settings?.questionLimit || 10)};
});

exports.submitAnswer = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required.');
  const {quizId, roundId, questionOrder, selectedIndex} = request.data || {};
  const id = safeId(quizId), rid = safeId(roundId), order = Number(questionOrder), choice = Number(selectedIndex);
  if (!Number.isInteger(order) || order < 0 || !Number.isInteger(choice) || choice < 0 || choice > 3) throw new HttpsError('invalid-argument', 'Invalid answer.');
  const quizRef = db.doc(`quizzes/${id}`), participantRef = db.doc(`participants/${id}_${uid}`);
  const keyRef = db.doc(`assignmentKeys/${rid}_${order}`), answerRef = db.doc(`answers/${rid}_${uid}_${order}`);
  return db.runTransaction(async tx => {
    const [qs, ps, ks, prior] = await Promise.all([tx.get(quizRef), tx.get(participantRef), tx.get(keyRef), tx.get(answerRef)]);
    if (!qs.exists || qs.data().status !== 'live' || qs.data().activeRoundId !== rid) throw new HttpsError('failed-precondition', 'Quiz is not live.');
    if (!ps.exists || !ks.exists) throw new HttpsError('permission-denied', 'Not authorized for this question.');
    if (prior.exists) throw new HttpsError('already-exists', 'Answer already submitted.');
    const correct = choice === ks.data().correctIndex;
    const points = correct ? Number(qs.data().settings?.pointsPerCorrect || 10) : 0;
    tx.create(answerRef, {quizId: id, roundId: rid, questionOrder: order, authUid: uid, questionId: ks.data().questionId, selectedIndex: choice, correct, points, createdAt: FieldValue.serverTimestamp()});
    tx.update(participantRef, {score: FieldValue.increment(points), lastAnswerAt: FieldValue.serverTimestamp()});
    return {correct, points};
  });
});

exports.finalizeQuiz = onCall(async request => {
  await requireAdmin(request.auth?.uid);
  const id = safeId(request.data?.quizId), quizRef = db.doc(`quizzes/${id}`), quizSnap = await quizRef.get();
  if (!quizSnap.exists) throw new HttpsError('not-found', 'Quiz not found.');
  const participants = await db.collection('participants').where('quizId', '==', id).get();
  const players = participants.docs.map(d => ({id: d.id, ...d.data()})).sort((a,b) => (b.score || 0) - (a.score || 0) || String(a.joinedAt?.toMillis?.() || 0).localeCompare(String(b.joinedAt?.toMillis?.() || 0)));
  const batch = db.batch();
  players.forEach((p, i) => batch.set(db.doc(`scores/${id}_${p.id}`), {quizId: id, participantId: p.id, authUid: p.authUid, displayName: p.displayName, score: p.score || 0, finalRank: i + 1, finalizedAt: FieldValue.serverTimestamp()}));
  const winners = players.slice(0, 3).map((p, i) => ({participantId: p.id, displayName: p.displayName, score: p.score || 0, rank: i + 1}));
  batch.set(db.doc(`winners/${id}`), {quizId: id, winners, finalizedAt: FieldValue.serverTimestamp()});
  batch.update(quizRef, {status: 'completed', endedAt: FieldValue.serverTimestamp()});
  await batch.commit();
  return {winner: winners[0] || null, totalParticipants: players.length};
});
