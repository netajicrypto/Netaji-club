# नेताजी क्लब — Live Quiz (Firebase Auth + Firestore)

Sab players **ek hi time par** quiz dete hain. Winner = sabse zyada sahi jawab; **tie ho to** jisne sahi jawabon me kam total time liya (server timestamp se). Uske baad bhi tie ho to jo pehle join hua.
Cloud Functions / billing **nahi chahiye** (free Spark plan chalega).

## Setup (ek baar)
1. Firebase Console → project `netaji-club` (config `js/firebase.js` me pehle se hai).
2. **Authentication → Sign-in method**: `Anonymous` ON karo (players ke liye) aur `Email/Password` ON karo (admin ke liye).
3. **Authentication → Settings → Authorized domains**: apna GitHub Pages domain (`username.github.io`) add karo.
4. **Authentication → Users → Add user**: admin email + password banao, uska **UID** copy karo.
5. **Firestore Database** banao, fir Console me collection `admins` → document ID = **wahi UID** → field `active` (boolean) = `true`.
6. Rules deploy karo: `firebase deploy --only firestore:rules` (ya Console → Firestore → Rules me `firestore.rules` paste karke Publish).
7. Site host karo: GitHub Pages (`.github/workflows/static.yml` ready hai) ya `firebase deploy --only hosting`.

## Quiz kaise chalayein
1. `admin.html` → login → questions add karo (ya JSON import) → **1) Save Quiz & Open Lobby**.
2. Players `index.html` par Quiz Code + naam daalkar join karte hain (lobby me wait).
3. Sab join ho jayein to **2) Start Quiz**. Countdown ke baad har player ko ek hi time par same question milta hai (har question ka fixed time).
4. Sab questions khatam hone par **3) End & Declare Winners** → players ko winners + full leaderboard dikhta hai. Results CSV export ho sakta hai.

## Security (rules me)
- Question text tabhi readable hai jab uska time shuru ho (server time); sahi answers (`keys`) sirf admin padh sakta hai.
- Har player ka ek question par ek hi answer, sirf create (edit nahi), time window ke andar, timestamp server ka.
- Score/rank sirf admin ke login se calculate hokar `results` me likhe jaate hain.

## JSON format
`{"quizTitle":"..","questions":[{"question":"..","options":["A","B","C","D"],"correctIndex":1}]}` (`correctIndex` 0=A … 3=D)

## Test tip
Admin aur players alag browser/incognito me kholo (admin login wale browser me player join mat karo).
