/* Know your Chinese – settings.
   The Gemini key is used for (1) natural Mandarin audio and (2) the "Ask the tutor" explanations.
   Everything still works without it: tone descriptions are built in, and audio falls back to the device's Chinese voice.
   SECURITY: never publish a real key in this file: anyone who opens the site can read it.
   Safest: set GEMINI_PROXY_URL to a small server function that holds the key. Otherwise each learner can paste their own key under Settings. */
window.CP_CONFIG = {
  GEMINI_API_KEY: "",          // leave EMPTY in files you publish. Learners may paste their own key under Settings (stored only in their browser).
  GEMINI_PROXY_URL: "",        // optional: your own server/function that adds the key for you, e.g. "https://your-site.example/api/gemini" (it receives /models/<model>:generateContent)
  GEMINI_BASE: "https://generativelanguage.googleapis.com/v1beta",
  TEXT_MODEL: "gemini-2.5-flash",
  TTS_MODEL: "gemini-2.5-flash-preview-tts",
  TTS_VOICE: "Kore",
  USE_GEMINI_TTS: true,
  USE_GEMINI_TUTOR: true,
  BED_VOLUME: 0.15,      // background bed under lessons (0-1), lowered from 0.22
  BED_QUIZ_VOLUME: 0.05, // bed level during a quiz, lowered from 0.08
  PASS_MARK: 8,          // correct answers needed (out of QUIZ_LENGTH) to open the next module
  QUIZ_LENGTH: 10,
  MIN_POOL: 25,          // every module gets at least this many questions (extra ones are built from its own vocabulary)
  DAILY_GOAL_XP: 50,     // default daily goal (learners can change it in Settings)
  SPEED_SECONDS: 60
};
