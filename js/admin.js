import {firebaseConfigured, auth, functions, db} from './firebase.js';
import {signInWithEmailAndPassword, signOut, onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {httpsCallable} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import {collection, query, where, getDocs} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = id => document.getElementById(id);
const KEY = 'netajiQuizDemoState';
const toast = message => { const t = $('toast'); if (!t) return; t.textContent = message; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3500); };
let questions = [], players = [], current = 0, isAdmin = false;
let quiz = {id:'PUJA2027', name:'Saraswati Puja Quiz 2027', status:'waiting', settings:{}};
const call = name => httpsCallable(functions, name);
function readState(){ try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function saveDemo(){ const state = readState(); state.quiz = quiz; state.questions = questions; state.players = players; sessionStorage.setItem(KEY, JSON.stringify(state)); }
function esc(value){ return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function settingsFromForm(){ return {questionLimit:+$('questionLimit').value, secondsPerQuestion:+$('secondsPerQuestion').value, pointsPerCorrect:+$('pointsPerCorrect').value, speedBonus:+$('speedBonus').value, maxParticipants:+$('maxParticipants').value, randomQuestions:$('randomQuestions').checked, randomOptions:$('randomOptions').checked}; }
function updateUiEnabled(enabled){ document.querySelectorAll('#createQuizForm button, #questionForm button, #startQuiz, #endQuiz, #jsonImport, #downloadTemplate').forEach(el => el.disabled = !enabled); }
function renderQuestions(){
  $('questionCountBadge').textContent = `${questions.length} Questions`;
  $('questionList').innerHTML = questions.map((q,i)=>`<div class="question-item"><div><b>${i+1}. ${esc(q.question)}</b><small>${q.options.map((o,j)=>`${String.fromCharCode(65+j)}: ${esc(o)}${j===q.correctIndex?' ✓':''}`).join(' • ')}</small></div><button class="small-delete" data-delete="${i}" ${isAdmin?'':'disabled'}>Delete</button></div>`).join('') || '<p class="muted">अभी प्रश्न नहीं जोड़े गए हैं।</p>';
  $('questionList').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{questions.splice(Number(b.dataset.delete),1);renderQuestions();saveDemo();});
}
function renderParticipants(){ $('participantCount').textContent = players.length; $('participantsBody').innerHTML = players.map(p=>`<tr><td>${esc(p.displayName||p.name)}</td><td>${esc(p.status||'Connected')}</td><td>${p.score||0}</td></tr>`).join('') || '<tr><td colspan="3">अभी कोई खिलाड़ी नहीं जुड़ा।</td></tr>'; }
function renderCurrent(){
  const q = questions[current]; $('currentQuestionStat').textContent = `${questions.length ? Math.min(current+1,questions.length):0}/${questions.length}`;
  $('adminCurrentQuestion').textContent = q ? q.question : 'गेम शुरू होने पर प्रश्न दिखेगा';
  $('adminCurrentOptions').innerHTML = q ? q.options.map((o,i)=>`<div>${String.fromCharCode(65+i)}. ${esc(o)}</div>`).join('') : '';
  $('adminStatus').textContent = quiz.status || 'waiting'; $('liveBadge').textContent = quiz.status === 'live' ? '● LIVE' : '● NOT LIVE';
}
function renderResults(){ const state=readState(), rs=state.lastResults||[]; $('resultsBody').innerHTML=rs.map(p=>`<tr><td>${esc(p.name)}</td><td>1</td><td>${(p.answers||[]).filter(a=>a.correct).length}</td><td>${(p.answers||[]).filter(a=>!a.correct).length}</td><td>${p.score||0}</td><td>${p.rank||'—'}</td></tr>`).join('') || '<tr><td colspan="6">परिणाम उपलब्ध होने पर यहाँ दिखेंगे।</td></tr>'; }
function validateQuestions(){ if(!questions.length) throw new Error('पहले प्रश्न जोड़ें।'); for(let i=0;i<questions.length;i++){const q=questions[i]; if(!q.question?.trim()||!Array.isArray(q.options)||q.options.length!==4||q.options.some(o=>!String(o).trim())||!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>3) throw new Error(`प्रश्न ${i+1} में text, चार options और सही उत्तर जाँचें।`);} }
async function saveQuiz(){
  if(!firebaseConfigured || !auth?.currentUser) throw new Error('पहले अधिकृत Admin Email और Password से लॉगिन करें।');
  validateQuestions(); quiz.id=$('adminQuizCode').value.trim().toUpperCase(); quiz.name=$('adminQuizName').value.trim(); quiz.settings=settingsFromForm();
  if(!quiz.id || !quiz.name) throw new Error('Quiz Name और Quiz Code जरूरी हैं।');
  const result=await call('createQuiz')({quizId:quiz.id,name:quiz.name,settings:quiz.settings,questions:questions.map(q=>({question:q.question,options:q.options,correctIndex:q.correctIndex}))});
  quiz.status=result.data.status; saveDemo(); renderCurrent(); return result.data;
}
function addLoginUi(){
  if($('adminLoginPanel')) return;
  const panel=document.createElement('section'); panel.id='adminLoginPanel'; panel.className='card panel admin-section';
  panel.innerHTML='<h2>Admin Login</h2><p class="muted">केवल Firebase में approved Admin account से लॉगिन करें।</p><form id="adminLoginForm" class="admin-form"><label>Admin Email ID<input id="adminEmail" type="email" autocomplete="username" required></label><label>Password<input id="adminPassword" type="password" autocomplete="current-password" required></label><div class="button-row"><button class="btn btn-primary" type="submit">Login</button><button class="btn btn-outline" id="adminLogout" type="button" hidden>Logout</button></div></form><p id="adminAuthStatus" class="muted">लॉगिन जरूरी है।</p>';
  const main=document.querySelector('.admin-main'); main.insertBefore(panel, main.firstChild);
  $('adminLoginForm').addEventListener('submit',async e=>{e.preventDefault();try{await signInWithEmailAndPassword(auth,$('adminEmail').value.trim(),$('adminPassword').value);toast('Login successful. Admin permission जाँची जा रही है।');}catch(err){$('adminAuthStatus').textContent=err.message;toast('Login failed: '+err.message);}});
  $('adminLogout').addEventListener('click',async()=>{await signOut(auth);});
}
async function checkAdmin(user){
  isAdmin=false;
  if(user){try{const r=await call('checkAdmin')({});isAdmin=!!r.data?.active;}catch(err){$('adminAuthStatus').textContent=err.message;}}
  $('adminAuthStatus').textContent=user?(isAdmin?`Approved Admin: ${user.email}`:`${user.email} लॉगिन है, लेकिन Admin permission नहीं मिली।`):'लॉगिन जरूरी है।';
  $('adminLogout').hidden=!user; $('adminMode').textContent=isAdmin?'Admin Verified':(user?'Not Authorized':'Login Required');
  $('firebaseStatus').textContent=isAdmin?'Firebase connected. Admin authorization verified; changes use secure Cloud Functions.':(firebaseConfigured?'Firebase configured. Approved Admin login जरूरी है।':'Firebase configuration उपलब्ध नहीं है।');
  updateUiEnabled(isAdmin); renderQuestions();
}

$('createQuizForm').addEventListener('submit',async e=>{e.preventDefault();try{const r=await saveQuiz();toast(`Quiz ${r.quizId} Firebase में सेव हुआ।`);}catch(err){toast('Save failed: '+err.message);}});
$('questionForm').addEventListener('submit',e=>{e.preventDefault();if(!isAdmin){toast('पहले Admin login करें।');return;}questions.push({id:crypto.randomUUID(),question:$('newQuestion').value.trim(),options:[$('optA').value.trim(),$('optB').value.trim(),$('optC').value.trim(),$('optD').value.trim()],correctIndex:Number($('correctOption').value)});e.target.reset();renderQuestions();saveDemo();toast('प्रश्न जोड़ा गया। Firebase में भेजने के लिए Save Quiz Settings दबाएँ।');});
$('startQuiz').addEventListener('click',async()=>{try{await saveQuiz();const r=await call('startQuiz')({quizId:quiz.id});quiz.status='live';saveDemo();current=0;renderCurrent();toast(`Quiz live है। ${r.data.questionCount} प्रश्न चुने गए।`);}catch(err){toast('Start failed: '+err.message);}});
$('endQuiz').addEventListener('click',async()=>{try{if(!isAdmin)throw new Error('पहले Admin login करें।');const r=await call('endQuiz')({quizId:$('adminQuizCode').value.trim().toUpperCase()});quiz.status='completed';try{await call('finalizeQuiz')({quizId:quiz.id});}catch(finalErr){console.warn('Finalization did not complete:',finalErr);}saveDemo();renderCurrent();renderResults();toast('Quiz समाप्त कर दिया गया।');}catch(err){toast('End failed: '+err.message);}});
$('nextQuestion').addEventListener('click',()=>{if(current<questions.length-1)current++;else toast('आखिरी प्रश्न है। Quiz समाप्त करें।');renderCurrent();});
$('revealQuestion').addEventListener('click',()=>toast('सही उत्तर की सार्वजनिक reveal सुविधा अभी चालू नहीं है।'));
$('jsonImport').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());const incoming=Array.isArray(data)?data:(data.questions||[]);const normalized=incoming.map((q,i)=>{const opts=q.options||[];let correctIndex=Number.isInteger(q.correctIndex)?q.correctIndex:opts.indexOf(q.correctAnswer);if(correctIndex<0&&typeof q.correctAnswer==='string')correctIndex=opts.findIndex(o=>String(o).toLowerCase()===q.correctAnswer.toLowerCase());if(!(q.question||q.q)||opts.length!==4||correctIndex<0||correctIndex>3)throw new Error(`प्रश्न ${i+1}: question, चार options और correctIndex/correctAnswer जरूरी हैं।`);return {id:q.id||crypto.randomUUID(),question:q.question||q.q,options:opts.map(String),correctIndex};});questions.push(...normalized);renderQuestions();saveDemo();toast(`${normalized.length} प्रश्न लोड हुए। Firebase में सेव करने के लिए Save Quiz Settings दबाएँ।`);}catch(err){toast('JSON error: '+err.message);}e.target.value='';});
$('downloadTemplate').addEventListener('click',()=>{const sample={quizTitle:'Saraswati Puja Quiz',questions:[{question:'भारत का राष्ट्रीय पक्षी कौन है?',options:['तोता','मोर','कबूतर','हंस'],correctIndex:1}]};download('question-template.json',JSON.stringify(sample,null,2),'application/json');});
$('exportCsv').addEventListener('click',()=>{const rs=readState().lastResults||[];const csv=[['Name','Score','Rank','Correct','Wrong'],...rs.map(p=>[p.name,p.score,p.rank,(p.answers||[]).filter(a=>a.correct).length,(p.answers||[]).filter(a=>!a.correct).length])].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');download('netaji-quiz-results.csv','\ufeff'+csv,'text/csv;charset=utf-8');});
function download(name,content,type){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([content],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

const old=readState(); if(old.quiz){quiz={...quiz,...old.quiz};questions=old.questions||old.quiz.questions||[];players=old.players||[];$('adminQuizName').value=quiz.name||quiz.name;$('adminQuizCode').value=quiz.id||'PUJA2027';if(quiz.settings){for(const [k,id] of Object.entries({questionLimit:'questionLimit',secondsPerQuestion:'secondsPerQuestion',pointsPerCorrect:'pointsPerCorrect',speedBonus:'speedBonus',maxParticipants:'maxParticipants'}))if(quiz.settings[k]!=null)$(id).value=quiz.settings[k];}}
addLoginUi(); renderQuestions();renderParticipants();renderCurrent();renderResults();
if(firebaseConfigured && auth && functions){onAuthStateChanged(auth, user=>checkAdmin(user));}else{ $('adminMode').textContent='Firebase Not Configured'; $('firebaseStatus').textContent='Firebase config नहीं मिला। js/firebase.js जाँचें।';updateUiEnabled(false);}
