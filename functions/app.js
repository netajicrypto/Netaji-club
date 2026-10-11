import {auth,db,fs,au,firebaseConfigured} from "./firebase.js";
const {doc,getDoc,getDocFromServer,getDocs,setDoc,onSnapshot,serverTimestamp,collection,query,orderBy}=fs;
const $=id=>document.getElementById(id);
const toast=m=>{const t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3500)};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let quizId=null,quiz=null,uid=null,offset=0,shownIdx=-1,answered={},resultsDone=false,tick=null;
$("connectionBadge").textContent=firebaseConfigured?"Live":"Not configured";
$("gameStatus").textContent="Quiz Code डालकर जुड़ें";

async function syncClock(){
  const t0=Date.now();
  await setDoc(doc(db,"pings",uid),{t:serverTimestamp()});
  const s=await getDocFromServer(doc(db,"pings",uid));
  offset=s.data().t.toMillis()-(t0+Date.now())/2;
}
$("joinForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const code=$("quizCode").value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,""),name=$("playerName").value.trim();
  const btn=$("joinForm").querySelector("button[type=submit]");btn.disabled=true;
  try{
    if(!auth.currentUser) await au.signInAnonymously(auth);
    uid=auth.currentUser.uid;
    const qs=await getDoc(doc(db,"quizzes",code));
    if(!qs.exists()){toast("यह Quiz Code नहीं मिला।");btn.disabled=false;return}
    if(qs.data().status==="completed"){toast("यह क्विज़ समाप्त हो चुका है।");btn.disabled=false;return}
    const pr=doc(db,"quizzes",code,"players",uid);
    if(!(await getDoc(pr)).exists()) await setDoc(pr,{name,joinedAt:serverTimestamp()});
    await syncClock();
    quizId=code;
    onSnapshot(doc(db,"quizzes",code),s=>{quiz=s.data()||null});
    $("playerGame").classList.remove("hidden");
    $("gameStatus").textContent=`${name}, आप क्विज़ में शामिल हैं`;
    toast("आप क्विज़ में शामिल हो गए।");
    clearInterval(tick);tick=setInterval(render,250);
  }catch(err){console.error(err);toast("जुड़ने में दिक्कत: "+(err.code||err.message));btn.disabled=false}
});

function setQ(counter,text){$("questionCounter").textContent=counter;$("questionText").textContent=text}
function render(){
  if(!quiz)return;
  if(quiz.status==="completed")return showResults();
  if(quiz.status!=="live"||!quiz.startedAt){setQ("Lobby","एडमिन के क्विज़ शुरू करने का इंतज़ार है…");$("options").innerHTML="";$("timer").textContent="–";return}
  const ms=quiz.sec*1000,el=Date.now()+offset-(quiz.startedAt.toMillis()+quiz.lead*1000);
  $("roundLabel").textContent="LIVE QUIZ";
  if(el<0){setQ("तैयार हो जाइए!","क्विज़ शुरू होने वाला है…");$("options").innerHTML="";$("timer").textContent=Math.ceil(-el/1000);shownIdx=-1;return}
  const idx=Math.floor(el/ms);
  if(idx>=quiz.count){setQ("क्विज़ खत्म","आपके सभी उत्तर दर्ज हो गए। नतीजे का इंतज़ार करें…");$("options").innerHTML="";$("timer").textContent="0";$("progressBar").style.width="100%";return}
  $("timer").textContent=Math.ceil((ms-el%ms)/1000);
  $("progressBar").style.width=`${(idx+1)/quiz.count*100}%`;
  $("myScore").textContent=Object.keys(answered).length;
  if(idx!==shownIdx)loadQuestion(idx);
}
async function loadQuestion(idx){
  shownIdx=idx;setQ(`Question ${idx+1}/${quiz.count}`,"प्रश्न लोड हो रहा है…");$("options").innerHTML="";$("answerMessage").textContent="";
  let q=null;
  for(let t=0;t<8&&shownIdx===idx&&!q;t++){
    try{q=(await getDoc(doc(db,"quizzes",quizId,"questions",String(idx)))).data()}catch{await new Promise(r=>setTimeout(r,400))}
  }
  if(!q||shownIdx!==idx)return;
  setQ(`Question ${idx+1}/${quiz.count}`,q.question);
  q.options.forEach((o,j)=>{
    const b=document.createElement("button");b.className="option-btn";b.textContent=String.fromCharCode(65+j)+". "+o;
    if(idx in answered){b.disabled=true;if(answered[idx]===j)b.classList.add("selected")}
    b.onclick=()=>answer(idx,j,b);$("options").append(b);
  });
}
async function answer(idx,j,btn){
  if(idx in answered)return;
  document.querySelectorAll("#options button").forEach(b=>b.disabled=true);btn.classList.add("selected");
  try{
    await setDoc(doc(db,"quizzes",quizId,"answers",`${uid}_${idx}`),{uid,q:idx,sel:j,at:serverTimestamp()});
    answered[idx]=j;$("answerMessage").textContent="✔ आपका जवाब दर्ज हो गया";$("myScore").textContent=Object.keys(answered).length;
  }catch(err){$("answerMessage").textContent="जवाब दर्ज नहीं हुआ (समय खत्म)";console.error(err)}
}
async function showResults(){
  if(resultsDone)return;resultsDone=true;clearInterval(tick);
  $("playerGame").classList.add("hidden");$("winnerPanel").classList.remove("hidden");$("leaderboardPanel").classList.remove("hidden");
  $("gameStatus").textContent="क्विज़ समाप्त — नतीजे घोषित";
  const lab=["प्रथम","द्वितीय","तृतीय"],med=["🥇","🥈","🥉"];
  $("winnerCards").innerHTML=(quiz.winners||[]).map((w,i)=>`<div class="winner-card ${i===0?"first":""}"><span class="medal">${med[i]}</span><strong>${esc(w.name)}</strong><span class="points">${w.correct} सही</span><small>${lab[i]} • ${(w.timeMs/1000).toFixed(1)}s</small></div>`).join("");
  try{
    const rs=await getDocs(query(collection(db,"quizzes",quizId,"results"),orderBy("rank")));
    $("leaderboardBody").innerHTML=rs.docs.map(d=>{const r=d.data();return `<tr${d.id===uid?' style="font-weight:800;background:#fff3c4"':""}><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.correct}</td><td>${(r.timeMs/1000).toFixed(1)}s</td></tr>`}).join("")||"<tr><td colspan=4>कोई परिणाम नहीं</td></tr>";
    const me=rs.docs.find(d=>d.id===uid);if(me)$("myRank").textContent="#"+me.data().rank;
  }catch(err){console.error(err)}
}
$("showLeaderboard").onclick=()=>{quiz&&quiz.status==="completed"?($("leaderboardPanel").classList.remove("hidden"),$("leaderboardPanel").scrollIntoView({behavior:"smooth"})):toast("लीडरबोर्ड क्विज़ खत्म होने पर दिखेगा।")};
$("viewFullLeaderboard").onclick=()=>{$("leaderboardPanel").scrollIntoView({behavior:"smooth"})};
