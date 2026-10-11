import {firebaseConfigured, db} from "./firebase.js";
import {doc, getDoc, collection, addDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $=id=>document.getElementById(id);
const toast=(m)=>{const t=$("toast");t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3200)};
$("connectionBadge").textContent=firebaseConfigured?"Firebase Connected":"Demo Mode";
let quiz=null, player=null, questions=[], currentIndex=0, answerLocked=false, timerInterval=null, unsubscribe=null;
const demoKey="netajiQuizDemoState";
function getDemo(){try{return JSON.parse(sessionStorage.getItem(demoKey)||"{}")}catch{return {}}}
function setDemo(v){sessionStorage.setItem(demoKey,JSON.stringify(v))}
async function join(code,name){
  if(firebaseConfigured){
    const snap=await getDoc(doc(db,"quizzes",code));
    if(!snap.exists()) throw new Error("यह Quiz Code नहीं मिला।");
    quiz={id:snap.id,...snap.data()};
    if(quiz.status==="completed") throw new Error("यह प्रतियोगिता समाप्त हो चुकी है।");
    // Production player identity/assignment must be created by a callable Cloud Function.
    throw new Error("Firebase जुड़ा है। Player join function deploy होने के बाद लाइव जॉइन चालू होगा। README देखें।");
  }
  const state=getDemo();quiz=state.quiz||{id:code,name:"Saraswati Puja Quiz 2027",status:"waiting",settings:{questionLimit:10,secondsPerQuestion:15,pointsPerCorrect:10,speedBonus:5},questions:state.questions||[]};
  if(code.toUpperCase()!==String(quiz.id).toUpperCase() && code.toUpperCase()!=="PUJA2027") throw new Error("Demo mode में Quiz Code PUJA2027 इस्तेमाल करें।");
  player={id:crypto.randomUUID(),name:name.trim(),score:0,answers:[],joinedAt:Date.now()};
  const players=state.players||[];players.push(player);state.players=players;setDemo(state);
  $("playerGame").classList.remove("hidden");$("gameStatus").textContent=`${name} जुड़ गए हैं`;
  toast("आप डेमो गेम में शामिल हो गए।");
  if(quiz.questions?.length) loadQuestion(0); else $("questionText").textContent="एडमिन के प्रश्न जोड़ने और गेम शुरू करने का इंतज़ार करें।";
  renderBoard();
}
$("joinForm").addEventListener("submit",async e=>{e.preventDefault();try{await join($("quizCode").value.trim(),$("playerName").value.trim())}catch(err){toast(err.message||"जुड़ने में समस्या हुई।")}});
function loadQuestion(i){
  if(!quiz?.questions?.length)return;
  if(i>=Math.min(quiz.settings?.questionLimit||10,quiz.questions.length)){finishDemo();return}
  currentIndex=i;answerLocked=false;const q=quiz.questions[i];
  $("questionCounter").textContent=`Question ${i+1}/${Math.min(quiz.settings?.questionLimit||10,quiz.questions.length)}`;
  $("roundLabel").textContent="ROUND 1";$("questionText").textContent=q.question;
  $("progressBar").style.width=`${(i+1)/Math.min(quiz.settings?.questionLimit||10,quiz.questions.length)*100}%`;
  $("options").innerHTML="";
  q.options.forEach((o,index)=>{const b=document.createElement("button");b.className="option-btn";b.textContent=String.fromCharCode(65+index)+".  "+o;b.onclick=()=>submitDemoAnswer(index,b);$("options").append(b)});
  startTimer(quiz.settings?.secondsPerQuestion||15);
}
function startTimer(n){clearInterval(timerInterval);let left=n;$("timer").textContent=left;timerInterval=setInterval(()=>{left--;$("timer").textContent=left;if(left<=0){clearInterval(timerInterval);if(!answerLocked){answerLocked=true;$("answerMessage").textContent="समय समाप्त";setTimeout(()=>loadQuestion(currentIndex+1),900)}}},1000)}
function submitDemoAnswer(index,button){
  if(answerLocked)return;answerLocked=true;clearInterval(timerInterval);
  const q=quiz.questions[currentIndex],correct=index===q.correctIndex;
  document.querySelectorAll("#options button").forEach((b,i)=>{b.disabled=true;if(i===q.correctIndex)b.classList.add("correct")});
  if(!correct)button.classList.add("wrong");
  const elapsed=(quiz.settings?.secondsPerQuestion||15)-Number($("timer").textContent);
  const points=correct?(quiz.settings?.pointsPerCorrect||10)+Math.max(0,Math.floor((quiz.settings?.secondsPerQuestion||15)-elapsed))*Math.floor((quiz.settings?.speedBonus||0)/(quiz.settings?.secondsPerQuestion||15)):0;
  player.score+=points;player.answers.push({questionId:q.id||String(currentIndex),correct,elapsed,points});
  $("myScore").textContent=player.score;$("answerMessage").textContent=correct?`सही जवाब! +${points} अंक`:"गलत जवाब";
  const s=getDemo();s.players=(s.players||[]).map(p=>p.id===player.id?player:p);setDemo(s);renderBoard();
  setTimeout(()=>loadQuestion(currentIndex+1),1200);
}
function renderBoard(){
  const state=getDemo(),players=state.players|| (player?[player]:[]);
  players.sort((a,b)=>b.score-a.score);
  $("leaderboardBody").innerHTML=players.length?players.map((p,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(p.name)}</td><td>${p.score||0}</td><td>—</td></tr>`).join(""):'<tr><td colspan="4">अभी कोई परिणाम नहीं है।</td></tr>';
  if(player)$("myRank").textContent=players.findIndex(p=>p.id===player.id)+1;
}
function finishDemo(){
 clearInterval(timerInterval);$("playerGame").classList.add("hidden");$("winnerPanel").classList.remove("hidden");
 const state=getDemo(),players=(state.players||[]).sort((a,b)=>b.score-a.score);
 $("winnerCards").innerHTML=players.slice(0,3).map((p,i)=>`<div class="winner-card ${i===0?"first":""}"><span class="medal">${["🥇","🥈","🥉"][i]}</span><strong>${escapeHtml(p.name)}</strong><span class="points">${p.score||0}</span><small>${i+1===1?"प्रथम":i+1===2?"द्वितीय":"तृतीय"} स्थान</small></div>`).join("");
 state.lastResults=players.map((p,i)=>({...p,rank:i+1}));setDemo(state);renderBoard();toast("डेमो राउंड समाप्त। Firebase पर परिणाम सेव करने के लिए सेटअप पूरा करें।");
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
$("showLeaderboard").onclick=()=>{$("leaderboardPanel").classList.remove("hidden");$("leaderboardPanel").scrollIntoView({behavior:"smooth"})};
$("viewFullLeaderboard").onclick=()=>{$("leaderboardPanel").classList.remove("hidden");$("leaderboardPanel").scrollIntoView({behavior:"smooth"})};
if(firebaseConfigured){$("connectionBadge").textContent="Firebase Configured";$("gameStatus").textContent="Firebase configured — deploy backend functions to enable live play."}
