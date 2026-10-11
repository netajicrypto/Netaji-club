import {auth,db,fs,au} from "./firebase.js";
const {doc,collection,getDoc,getDocs,setDoc,updateDoc,onSnapshot,writeBatch,serverTimestamp,query,orderBy}=fs;
const $=id=>document.getElementById(id);
const toast=m=>{const t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3500)};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const code=()=>$("adminQuizCode").value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"");
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
let questions=[],quiz=null,players=[],answers=[],keys={},rows=[],unsubs=[],qid=null;
const qRef=id=>doc(db,"quizzes",id),sub=(id,n)=>collection(db,"quizzes",id,n);

// ---------- login ----------
$("loginForm").addEventListener("submit",async e=>{e.preventDefault();
  try{await au.signInWithEmailAndPassword(auth,$("adminEmail").value.trim(),$("adminPass").value)}catch(err){toast("Login fail: "+(err.code||err.message))}});
$("logoutBtn").onclick=()=>au.signOut(auth);
au.onAuthStateChanged(auth,async u=>{
  if(!u||u.isAnonymous){$("loginBox").classList.remove("hidden");$("adminApp").classList.add("hidden");return}
  const a=await getDoc(doc(db,"admins",u.uid)).catch(()=>null);
  if(!a||!a.exists()||a.data().active!==true){toast("यह अकाउंट Admin नहीं है। UID: "+u.uid);$("loginBox").classList.remove("hidden");$("adminApp").classList.add("hidden");return}
  $("loginBox").classList.add("hidden");$("adminApp").classList.remove("hidden");$("adminMode").textContent="Admin ✔";watch(code());
});

// ---------- question bank ----------
function renderQuestions(){
  $("questionCountBadge").textContent=`${questions.length} Questions`;
  $("questionList").innerHTML=questions.map((q,i)=>`<div class="admin-q card panel" style="padding:12px"><b>${i+1}. ${esc(q.question)}</b><div class="admin-options" style="margin-top:8px">${q.options.map((o,j)=>`<div class="${j===q.correctIndex?"correct":""}">${"ABCD"[j]}. ${esc(o)}</div>`).join("")}</div><button class="btn btn-outline" data-del="${i}" type="button" style="margin-top:8px">Delete</button></div>`).join("");
}
$("questionList").onclick=e=>{const i=e.target.dataset.del;if(i!==undefined){questions.splice(+i,1);renderQuestions()}};
$("questionForm").addEventListener("submit",e=>{e.preventDefault();
  questions.push({question:$("newQuestion").value.trim(),options:["optA","optB","optC","optD"].map(x=>$(x).value.trim()),correctIndex:+$("correctOption").value});
  e.target.reset();renderQuestions();toast("प्रश्न जुड़ गया");});
const valid=q=>q&&q.question&&Array.isArray(q.options)&&q.options.length===4&&Number.isInteger(q.correctIndex)&&q.correctIndex>=0&&q.correctIndex<=3;
$("jsonImport").addEventListener("change",async e=>{try{
  const d=JSON.parse(await e.target.files[0].text()),list=Array.isArray(d)?d:d.questions;
  if(!Array.isArray(list)||!list.every(valid))throw new Error("Format galat");
  questions.push(...list.map(q=>({question:String(q.question),options:q.options.map(String),correctIndex:q.correctIndex})));
  if(d.quizTitle)$("adminQuizName").value=d.quizTitle;renderQuestions();toast(list.length+" प्रश्न import हुए");
}catch(err){toast("JSON error: "+err.message)}e.target.value=""});
$("downloadTemplate").onclick=()=>{const b=new Blob([JSON.stringify({quizTitle:"Saraswati Puja Quiz",questions:[{question:"भारत का राष्ट्रीय पक्षी कौन है?",options:["तोता","मोर","कबूतर","हंस"],correctIndex:1}]},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="quiz-template.json";a.click()};

// ---------- firestore helpers ----------
async function commit(ops){for(let i=0;i<ops.length;i+=400){const b=writeBatch(db);ops.slice(i,i+400).forEach(([r,d])=>d===null?b.delete(r):b.set(r,d));await b.commit()}}
async function clearSub(id,n){const s=await getDocs(sub(id,n));await commit(s.docs.map(d=>[d.ref,null]))}

// ---------- save / start / end ----------
$("createQuizForm").addEventListener("submit",async e=>{e.preventDefault();
  if(!questions.length)return toast("पहले प्रश्न जोड़ें");
  const id=code(),sec=+$("secondsPerQuestion").value,lead=+$("leadSec").value;
  if(!id)return toast("Quiz code डालें");
  if(!confirm(`"${id}" का पुराना data (players/answers/results) मिटाकर नया quiz बनाएँ?`))return;
  try{
    let qs=questions.slice();if($("randomQuestions").checked)shuffle(qs);qs=qs.slice(0,Math.max(1,+$("questionLimit").value||qs.length));
    for(const n of["questions","keys","players","answers","results"])await clearSub(id,n);
    const ops=[[qRef(id),{name:$("adminQuizName").value.trim(),status:"waiting",sec,lead,count:qs.length,winners:[],createdAt:serverTimestamp()}]];
    qs.forEach((q,i)=>{ops.push([doc(db,"quizzes",id,"questions",String(i)),{question:q.question,options:q.options}]);ops.push([doc(db,"quizzes",id,"keys",String(i)),{correctIndex:q.correctIndex}])});
    await commit(ops);watch(id);toast(`Lobby खुल गया। Players Quiz Code "${id}" से जुड़ें।`);
  }catch(err){console.error(err);toast("Save error: "+(err.code||err.message))}
});
$("startQuiz").onclick=async()=>{
  if(!quiz||quiz.status!=="waiting")return toast("पहले Quiz Save करें (status: waiting चाहिए)");
  if(!confirm(`${players.length} players जुड़े हैं। Quiz शुरू करें? ${quiz.lead} सेकंड countdown के बाद Q1 आएगा।`))return;
  await updateDoc(qRef(qid),{status:"live",startedAt:serverTimestamp()});toast("Quiz शुरू!");
};
function score(){
  const st=quiz.startedAt.toMillis()+quiz.lead*1000,ms=quiz.sec*1000,out=players.map(p=>{
    const mine=answers.filter(a=>a.uid===p.id&&a.at);let correct=0,timeMs=0;
    mine.forEach(a=>{if(keys[a.q]===a.sel){correct++;timeMs+=Math.max(0,a.at.toMillis()-(st+a.q*ms))}});
    return{uid:p.id,name:p.name,answered:mine.length,correct,wrong:mine.length-correct,timeMs,joined:p.joinedAt?p.joinedAt.toMillis():0};
  });
  out.sort((a,b)=>b.correct-a.correct||a.timeMs-b.timeMs||a.joined-b.joined);
  out.forEach((r,i)=>r.rank=i+1);return out;
}
$("endQuiz").onclick=async()=>{
  if(!quiz||quiz.status==="completed")return toast("Quiz पहले ही खत्म है");
  if(quiz.status!=="live")return toast("Quiz अभी शुरू नहीं हुआ");
  if(!confirm("Quiz खत्म करके विजेता घोषित करें?"))return;
  try{
    const r=score(),ops=r.map(x=>[doc(db,"quizzes",qid,"results",x.uid),{name:x.name,answered:x.answered,correct:x.correct,wrong:x.wrong,timeMs:x.timeMs,rank:x.rank}]);
    await commit(ops);
    await updateDoc(qRef(qid),{status:"completed",endedAt:serverTimestamp(),winners:r.slice(0,3).map(x=>({name:x.name,correct:x.correct,timeMs:x.timeMs,rank:x.rank}))});
    toast("विजेता घोषित हो गए 🏆");
  }catch(err){console.error(err);toast("Error: "+(err.code||err.message))}
};

// ---------- live watchers ----------
async function watch(id){
  unsubs.forEach(u=>u());unsubs=[];qid=id;quiz=null;players=[];answers=[];keys={};rows=[];
  const ks=await getDocs(sub(id,"keys")).catch(()=>null);if(ks)ks.docs.forEach(d=>keys[+d.id]=d.data().correctIndex);
  const qd=await getDocs(sub(id,"questions")).catch(()=>null);
  if(qd&&qd.size&&!questions.length)questions=qd.docs.sort((a,b)=>a.id-b.id).map(d=>({question:d.data().question,options:d.data().options,correctIndex:keys[+d.id]??0}));
  renderQuestions();
  unsubs.push(onSnapshot(qRef(id),s=>{quiz=s.data()||null;paint()}));
  unsubs.push(onSnapshot(sub(id,"players"),s=>{players=s.docs.map(d=>({id:d.id,...d.data()}));paint()}));
  unsubs.push(onSnapshot(sub(id,"answers"),s=>{answers=s.docs.map(d=>d.data());paint()}));
  unsubs.push(onSnapshot(query(sub(id,"results"),orderBy("rank")),s=>{rows=s.docs.map(d=>d.data());paintResults()}));
}
function paintResults(){
  $("resultsBody").innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.answered}</td><td>${r.correct}</td><td>${r.wrong}</td><td>${(r.timeMs/1000).toFixed(1)}s</td><td>${r.rank}</td></tr>`).join(""):'<tr><td colspan="6">गेम खत्म होने के बाद परिणाम यहाँ दिखेंगे।</td></tr>';
}
function paint(){
  $("participantCount").textContent=players.length;
  if(!quiz){$("adminStatus").textContent="No quiz";return}
  $("adminStatus").textContent={waiting:"Lobby open",live:"LIVE",completed:"Completed"}[quiz.status]||quiz.status;
  $("durationStat").textContent=Math.ceil((quiz.lead+quiz.count*quiz.sec)/60)+"m";
  $("liveBadge").textContent=quiz.status==="live"?"● LIVE":"● NOT LIVE";
  const s=quiz.status==="live"&&quiz.startedAt?score():players.map(p=>({name:p.name,answered:0,correct:0}));
  $("participantsBody").innerHTML=s.length?s.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.answered}</td><td>${r.correct}</td></tr>`).join(""):'<tr><td colspan="3">अभी कोई खिलाड़ी नहीं जुड़ा।</td></tr>';
}
setInterval(()=>{ // admin-side display of current question (local clock, display only)
  if(!quiz||quiz.status!=="live"||!quiz.startedAt)return;
  const ms=quiz.sec*1000,el=Date.now()-(quiz.startedAt.toMillis()+quiz.lead*1000);
  if(el<0){$("currentQuestionStat").textContent=`0/${quiz.count}`;$("timerLine").textContent=`Start in ${Math.ceil(-el/1000)}s`;return}
  const i=Math.floor(el/ms);
  if(i>=quiz.count){$("currentQuestionStat").textContent=`${quiz.count}/${quiz.count}`;$("timerLine").textContent="सभी प्रश्न खत्म — अब 'End & Declare Winners' दबाएँ।";return}
  $("currentQuestionStat").textContent=`${i+1}/${quiz.count}`;$("timerLine").textContent=`समय बचा: ${Math.ceil((ms-el%ms)/1000)}s`;
  const q=questions[i];
  if(q){$("adminCurrentQuestion").textContent=q.question;$("adminCurrentOptions").innerHTML=q.options.map((o,j)=>`<div class="${j===keys[i]?"correct":""}">${"ABCD"[j]}. ${esc(o)}</div>`).join("")}
},500);
$("exportCsv").onclick=()=>{
  if(!rows.length)return toast("पहले विजेता घोषित करें");
  const csv="Rank,Name,Answered,Correct,Wrong,TotalTimeSec\n"+rows.map(r=>[r.rank,`"${r.name.replace(/"/g,'""')}"`,r.answered,r.correct,r.wrong,(r.timeMs/1000).toFixed(2)].join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`${qid}-results.csv`;a.click();
};
