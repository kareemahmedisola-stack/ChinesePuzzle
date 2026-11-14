KNOW YOUR CHINESE (你懂中文吗 · Nǐ dǒng Zhōngwén ma?)
Produced by AwesomeKam of the AwesomePlanet – Mandarin & PRC Studies
19 modules · 668 quiz questions · 611 practice words · 102 practice sentences · 17 badges

THIS IS THE INTEGRATED VERSION (cache cp-v11)
It merges the two earlier packages (ChinesePuzzle.zip and ChinesePuzzle_upgraded.zip) into one app.
Both packages had grown from the same base and built overlapping features, so there is now ONE
word bank, ONE review schedule, ONE XP total and ONE streak. Progress saved by either older
version is carried over automatically the first time you open this one.

HOW IT WORKS
- Read a module, then take its 10-question quiz.
- 8/10 or more: clap sound, next module opens.   Under 8: sad tune, you repeat the module.
- A soft background bed plays under the lessons, dips during the quiz and under every sound or voice,
  and is paused and resumed with the Pause/Play button in the top bar (it stops every sound and voice, and chimes to confirm).
- Tap any underlined pinyin or Chinese character to hear it and see a description of each tone.
  The tone icon in the top bar opens the tone guide.

LEARN  (education)
- Every module has at least 25 questions (hand-written, plus extras for the thin modules, plus a few
  built from each module's own vocabulary), so a retry is never the same ten.
- Quizzes mix in listening, tone-spotting, characters-to-pinyin and fill-the-gap questions.
- Wrong pinyin answers differ mostly by TONE, and wrong character answers share a character with the
  right one, so you have to listen and look closely.
- 608 of the 668 questions explain their answer. 440 of those are quotations from the lesson they came
  from (nothing invented). Please review them in review/explanations_to_approve.csv. To edit or remove one,
  change its entry in js/explanations.js. Hand-written explanations in course.js always win.
- Daily review (about 5 minutes): due words first, then new words, then your weakest words. Missed
  quiz questions join the same schedule. Right answers come back after 1, 2, 4, 8 and 16 days; a miss
  comes back again soon, and the same word returns a few questions later in an easier form.
- Ask the tutor (optional, needs AI set up): explains why an answer is right.

PLAY  (entertainment)
- Practice games: Daily review, Listen and choose, Which tone?, Tone duel, Sentence builder,
  Memory match, Speed round, Offline audio, My badges.
- Today card on the home page: XP ring, daily goal (30, 50 or 100), day streak, level (every 250 XP).
- 17 badges drawn as 3D coins (pure CSS, no libraries). Tap or drag a coin to turn it.
- Right answer = clap.  Wrong answer = emotional damage.  Quiz begins = QuestionTag.

ACCESSIBLE  (for everyone)
- Keyboard: A to D or 1 to 4 answer; in listening questions R plays again and S plays slowly;
  Esc leaves a practice session. Skip link, labelled buttons, live announcements for results.
- Settings (home screen, bottom): Text size (Normal, Large, Extra large), High contrast colours,
  Reduce motion and confetti. The app also follows your device's dark mode and reduced-motion settings.
- No Chinese voice or no internet? Listening questions quietly become reading questions, so practice
  never gets stuck, and the app tells you when that happened.
- Offline audio: each Mandarin clip is saved on the device the first time it is made, so saved words
  play instantly with no internet. Practice games > Offline audio can save a whole batch at once.
- Answer options with pinyin or characters no longer break apart on screen (a button was nested inside
  a button in the older version; fixed).

RUN IT
- Double-click index.html to play right away (no offline install in this mode), or
- Upload the WHOLE folder (index.html, css, js, sounds, img, icons, manifest.json, sw.js) to any HTTPS
  web host (Netlify, GitHub Pages, etc.). Then it installs as an app and works offline.
  Local test:  python3 -m http.server 8000   then open http://localhost:8000
- If the page ever stays on "Loading…", it now says why after a few seconds (for example which file did
  not load) and offers a "Reload with fresh files" button.

FILES
index.html, manifest.json, sw.js, css/style.css, css/game.css, icons/, img/welcome.jpeg, sounds/,
review/explanations_to_approve.csv, Chinese_Mandarin_PRC_Tutorial.docx (the source tutorial)
js/config.js        settings: Gemini options, pass mark, quiz length, daily goal
js/course.js        all lessons and hand-written questions
js/course-extra.js  extra questions for the thinner modules
js/explanations.js  drafted explanations (440)
js/pinyin.js        tone engine
js/audio.js         sounds, Mandarin audio (AI voice or device voice), saved clips, tutor
js/engine.js        word bank, tone-aware questions, tone duels, review scheduling
js/game.js          XP, streak, goals, badges, quiz hooks, Sentence builder, Memory match, Speed round, settings
js/practice.js      Daily review, ear training screens, Offline audio
js/app.js           lessons, quizzes, home page, routing

SERVICE WORKER (sw.js)
Code files (html, js, css) are fetched fresh whenever you are online and kept for offline use, so a new
version can never mix with old files. Sounds and pictures come from the cache. Bump VERSION in sw.js
whenever you change files.

GEMINI KEY (js/config.js)
No API key is stored in the files. For AI audio and the tutor, either set GEMINI_PROXY_URL in
js/config.js (your own server adds the key) or let each learner paste their own key under Settings on
the home screen (kept only in their browser). If a key from an earlier package was ever published,
delete it in Google AI Studio and create a new one.
The app works without any key: tone descriptions are built in, and audio uses the device's Chinese voice.
If the model names stop working, change TEXT_MODEL / TTS_MODEL in config.js.
