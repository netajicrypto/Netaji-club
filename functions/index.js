const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const crypto = require("crypto");
initializeApp();
const db = getFirestore();

async function requireAdmin(uid) {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const snap = await db.doc(`admins/${uid}`).get();
  if (!snap.exists || snap.data().active !== true) throw new HttpsError("permission-denied", "Admin access required.");
}
function safeId(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0,100); }

exports.createQuiz = onCall(async (request) => {
  await requireAdmin(request.auth && request.auth.uid);
  const {quizId, name, settings, questions} = request.data || {};
  if (!quizId || !name || !Array.isArray(questions) || questions.length < 1) throw new HttpsError("invalid-argument","quizId, name and questions are required.");
  if (questions.some(q => !q.question || !Array.isArray(q.options) || q.options.length !== 4 || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3)) {
    throw new HttpsError("invalid-argument","Each question needs text, four options and correctIndex 0–3.");
  }
  const id = safeId(quizId);
  const batch = db.batch();
  batch.set(db.doc(`quizzes/${id}`), {
    name, status:"waiting", public:true,
    settings: {
      questionLimit: Math.max(1, Math.min(100, Number(settings?.questionLimit || 10))),
      secondsPerQuestion: Math.max(5, Math.min(180, Number(settings?.secondsPerQuestion || 15))),
      pointsPerCorrect: Math.max(1, Number(settings?.pointsPerCorrect || 10)),
      speedBonus: Math.max(0, Number(settings?.speedBonus || 0)),
      maxParticipants: Math.max(2, Math.min(500, Number(settings?.maxParticipants || 30)))
    }, questionCount: questions.length, createdBy:request.auth.uid,
    createdAt:FieldValue.serverTimestamp()
  });
  // Correct keys are stored separately from public quiz metadata.
  questions.forEach((q,i) => batch.set(db.doc(`questionBanks/${id}_${i}`), {
    quizId:id, order:i, question:q.question, options:q.options,
    correctIndex:q.correctIndex, active:true
  }));
  await batch.commit();
  return {quizId:id, status:"waiting"};
});

exports.joinQuiz = onCall(async (request) => {
  const {quizId, displayName} = request.data || {};
  if (!quizId || typeof displayName !== "string" || displayName.trim().length < 1 || displayName.trim().length > 40)
    throw new HttpsError("invalid-argument","Valid quizId and displayName are required.");
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated","Player sign-in is required for this secure endpoint.");
  const qRef = db.doc(`quizzes/${safeId(quizId)}`);
  const pRef = db.doc(`participants/${safeId(quizId)}_${uid}`);
  const result = await db.runTransaction(async tx => {
    const qs = await tx.get(qRef);
    if (!qs.exists) throw new HttpsError("not-found","Quiz not found.");
    const q = qs.data();
    if (!["waiting","live"].includes(q.status)) throw new HttpsError("failed-precondition","Quiz is not accepting players.");
    const ps = await tx.get(pRef);
    if (!ps.exists) {
      const count = await tx.get(db.collection("participants").where("quizId","==",safeId(quizId)));
      if (count.size >= Number(q.settings?.maxParticipants || 30)) throw new HttpsError("resource-exhausted","Quiz is full.");
      tx.set(pRef,{quizId:safeId(quizId),authUid:uid,displayName:displayName.trim(),score:0,joinedAt:FieldValue.serverTimestamp(),status:"joined"});
    }
    return {quizId:safeId(quizId),participantId:pRef.id,status:q.status};
  });
  return result;
});

exports.startQuiz = onCall(async (request) => {
  await requireAdmin(request.auth && request.auth.uid);
  const id = safeId(request.data?.quizId || "");
  const qRef = db.doc(`quizzes/${id}`);
  const qSnap = await qRef.get();
  if (!qSnap.exists) throw new HttpsError("not-found","Quiz not found.");
  const q = qSnap.data();
  if (q.status !== "waiting") throw new HttpsError("failed-precondition","Quiz must be waiting to start.");
  const qs = await db.collection("questionBanks").where("quizId","==",id).where("active","==",true).get();
  if (qs.size < q.settings.questionLimit) throw new HttpsError("failed-precondition","Not enough questions in the bank.");
  const selected = qs.docs.map(d=>({id:d.id,...d.data()})).sort(()=>Math.random()-.5).slice(0,q.settings.questionLimit);
  const batch = db.batch();
  const roundId = crypto.randomUUID();
  batch.set(db.doc(`rounds/${roundId}`),{quizId:id,roundNumber:1,status:"live",questionCount:selected.length,startedAt:FieldValue.serverTimestamp()});
  // Server-only assignment records include correct key; client cannot read or write these directly.
  selected.forEach((q,i)=>batch.set(db.doc(`questionAssignments/${roundId}_${i}`),{
    quizId:id,roundId,questionId:q.id,order:i,question:q.question,options:q.options,correctIndex:q.correctIndex
  }));
  batch.update(qRef,{status:"live",activeRoundId:roundId,startedAt:FieldValue.serverTimestamp()});
  await batch.commit();
  return {roundId,questionCount:selected.length};
});

exports.submitAnswer = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError("unauthenticated","Sign-in required.");
  const {quizId, roundId, questionOrder, selectedIndex} = request.data || {};
  if (!quizId || !roundId || !Number.isInteger(questionOrder) || !Number.isInteger(selectedIndex) || selectedIndex<0 || selectedIndex>3)
    throw new HttpsError("invalid-argument","Invalid answer payload.");
  const qid=safeId(quizId), participantId=`${qid}_${uid}`;
  const assignmentRef=db.doc(`questionAssignments/${safeId(roundId)}_${questionOrder}`);
  const answerRef=db.doc(`answers/${safeId(roundId)}_${uid}_${questionOrder}`);
  const participantRef=db.doc(`participants/${participantId}`);
  const result=await db.runTransaction(async tx=>{
    const [quizSnap, assignmentSnap, participantSnap, prior] = await Promise.all([
      tx.get(db.doc(`quizzes/${qid}`)),tx.get(assignmentRef),tx.get(participantRef),tx.get(answerRef)
    ]);
    if(!quizSnap.exists||quizSnap.data().status!=="live") throw new HttpsError("failed-precondition","Quiz is not live.");
    if(!assignmentSnap.exists||!participantSnap.exists) throw new HttpsError("not-found","Question or participant not found.");
    if(prior.exists) throw new HttpsError("already-exists","Answer already submitted.");
    const a=assignmentSnap.data(), correct=selectedIndex===a.correctIndex;
    const receivedAt=Date.now(); // server runtime, not client-provided
    const points=correct?Number(quizSnap.data().settings?.pointsPerCorrect||10):0;
    tx.create(answerRef,{quizId:qid,roundId,questionOrder,authUid:uid,questionId:a.questionId,selectedIndex,correct,points,receivedAt,createdAt:FieldValue.serverTimestamp()});
    tx.update(participantRef,{score:FieldValue.increment(points),lastAnswerAt:FieldValue.serverTimestamp()});
    return {correct,points,receivedAt};
  });
  return result;
});

exports.finalizeQuiz = onCall(async (request) => {
  await requireAdmin(request.auth && request.auth.uid);
  const id=safeId(request.data?.quizId||"");
  const qRef=db.doc(`quizzes/${id}`);
  const qs=await qRef.get();
  if(!qs.exists) throw new HttpsError("not-found","Quiz not found.");
  const q=qs.data();
  const ps=await db.collection("participants").where("quizId","==",id).get();
  const players=ps.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.score||0)-(a.score||0));
  const batch=db.batch();
  players.forEach((p,i)=>{
    batch.set(db.doc(`scores/${id}_${p.id}`),{quizId:id,participantId:p.id,authUid:p.authUid,displayName:p.displayName,score:p.score||0,finalRank:i+1,finalizedAt:FieldValue.serverTimestamp()});
  });
  const winners=players.slice(0,3).map((p,i)=>({participantId:p.id,displayName:p.displayName,score:p.score||0,rank:i+1}));
  batch.set(db.doc(`winners/${id}`),{quizId:id,winners,finalizedAt:FieldValue.serverTimestamp()});
  batch.update(qRef,{status:"completed",endedAt:FieldValue.serverTimestamp()});
  await batch.commit();
  return {winner:winners[0]||null,totalParticipants:players.length};
});
