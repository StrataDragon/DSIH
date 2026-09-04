import { api } from "../services/api";
import {
  hasActivePlayback,
  languageToBCP47,
  playExclusiveAudio,
  speakExclusive,
} from "./speechUtils";

const fallbackWelcomeMessages: Record<string, { incomplete: string; complete: string }> = {
  en: {
    incomplete: "Welcome to Tech Sahaya! Let's get your profile set up.",
    complete: "Welcome back to Tech Sahaya! Explore your welfare schemes and benefits.",
  },
  hi: {
    incomplete: "टेक सहाय में आपका स्वागत है! आइए आपकी प्रोफ़ाइल सेट करें।",
    complete: "टेक सहाय में आपका पुनः स्वागत है! अपनी कल्याणकारी योजनाओं और लाभों को देखें।",
  },
  kn: {
    incomplete: "ಟೆಕ್ ಸಹಾಯಕ್ಕೆ ಸ್ವಾಗತ! ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಅನ್ನು ಹೊಂದಿಸೋಣ.",
    complete: "ಟೆಕ್ ಸಹಾಯಕ್ಕೆ ಮರಳಿ ಸ್ವಾಗತ! ನಿಮ್ಮ ಕಲ್ಯಾಣ ಯೋಜನೆಗಳು ಮತ್ತು ಪ್ರಯೋಜನಗಳನ್ನು ಅನ್ವೇಷಿಸಿ.",
  },
  te: {
    incomplete: "టెక్ సహాయకు స్వాగతం! మీ ప్రొఫైల్‌ను సెట్ చేద్దాం.",
    complete: "టెక్ సహాయకు తిరిగి స్వాగతం! మీ సంక్షేమ పథకాలు మరియు ప్రయోజనాలను అన్వేషించండి.",
  },
  ta: {
    incomplete: "டெக் சகாயாவிற்கு வரவேற்கிறோம்! உங்கள் சுயவிவரத்தை அமைப்போம்.",
    complete: "டெக் சகாயாவிற்கு மீண்டும் வரவேற்கிறோம்! உங்கள் நலத்திட்டங்களையும் பலன்களையும் ஆராயுங்கள்.",
  },
  ml: {
    incomplete: "ടെക് സഹായയിലേക്ക് സ്വാഗതം! നിങ്ങളുടെ പ്രൊഫൈൽ സജ്ജീകരിക്കാം.",
    complete: "ടെക് സഹായയിലേക്ക് വീണ്ടും സ്വാഗതം! നിങ്ങളുടെ ക്ഷേമ പദ്ധതികളും ആനുകൂല്യങ്ങളും പര്യവേക്ഷണം ചെയ്യുക.",
  },
  bn: {
    incomplete: "টেক সহায়ে স্বাগতম! আসুন আপনার প্রোফাইল সেট আপ করি।",
    complete: "টেক সহায়ে আবার স্বাগতম! আপনার কল্যাণ প্রকল্প এবং সুবিধাগুলি সন্ধান করুন।",
  },
  mr: {
    incomplete: "टेक सहाय्य मध्ये आपले स्वागत आहे! चला आपले प्रोफाईल सेट करूया.",
    complete: "टेक सहाय्य मध्ये आपले पुन्हा स्वागत आहे! आपल्या कल्याणकारी योजना आणि फायदे पहा.",
  },
  gu: {
    incomplete: "ટેક સહાયમાં આપનું સ્વાગત છે! ચાલો તમારી પ્રોફાઇલ સેટ કરીએ.",
    complete: "ટેક સહાયમાં ફરી સ્વાગત છે! તમારી કલ્યાણકારી યોજનાઓ અને લાભો શોધો.",
  },
};

let inFlight = false;

/**
 * Plays the welcome voice message once per session/entry for the authenticated user.
 * Reuses backend Sarvam AI audio endpoint with graceful browser SpeechSynthesis fallback.
 */
export async function playWelcomeVoice(
  language: string = "en",
  isProfileComplete: boolean = false,
  userId?: string
): Promise<void> {
  const sessionKey = `tech-sahaya-welcome-voice:${userId || "anonymous"}`;

  // Deduplication: prevent multiple plays on re-renders, route changes, or state updates
  if (sessionStorage.getItem(sessionKey) || inFlight) {
    return;
  }

  inFlight = true;
  sessionStorage.setItem(sessionKey, "pending");

  const langKey = (language || "en").toLowerCase().slice(0, 2);
  const fallback = fallbackWelcomeMessages[langKey] || fallbackWelcomeMessages.en;
  const messageText = isProfileComplete ? fallback.complete : fallback.incomplete;

  const playBrowserTTS = () => {
    try {
      if (!("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(messageText);
      utterance.lang = languageToBCP47(language);
      utterance.rate = 0.95;
      speakExclusive(
        utterance,
        () => {
          sessionStorage.setItem(sessionKey, "played");
          inFlight = false;
        },
        () => {
          inFlight = false;
        },
        () => {
          inFlight = false;
        }
      );
    } catch {
      inFlight = false;
    }
  };

  try {
    // If other audio is active, wait briefly or cancel
    if (hasActivePlayback()) {
      inFlight = false;
      return;
    }

    // Attempt high-quality Sarvam AI backend audio first
    const response = await api.post("/api/onboarding/welcome-audio", null, {
      params: { language: langKey },
      timeout: 6000,
    });

    if (response?.data?.audio_base64) {
      const mime = response.data.audio_mime || "audio/wav";
      const player = new Audio(`data:${mime};base64,${response.data.audio_base64}`);

      await playExclusiveAudio(
        player,
        () => {
          sessionStorage.setItem(sessionKey, "played");
          inFlight = false;
        },
        () => {
          inFlight = false;
        },
        () => {
          playBrowserTTS();
        }
      );
    } else {
      playBrowserTTS();
    }
  } catch {
    // Fall back gracefully to browser Web Speech API
    playBrowserTTS();
  }
}

/**
 * Resets welcome audio session tracker upon logout so another user logging in gets welcomed.
 */
export function resetWelcomeVoice(userId?: string): void {
  if (userId) {
    sessionStorage.removeItem(`tech-sahaya-welcome-voice:${userId}`);
  }
  sessionStorage.removeItem("tech-sahaya-welcome-voice:anonymous");
  inFlight = false;
}
