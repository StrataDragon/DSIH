import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProfileForm } from "../components/ProfileForm";
import { api } from "../services/api";
import { useAppContext } from "../context/AppContext";
import { t } from "../utils/i18n";
import { LanguageSelect } from "../components/LanguageSelect";
import { hasActivePlayback, playExclusiveAudio, stopAllPlayback } from "../utils/speechUtils";

export function ProfileSetupPage() {
  const { profile, setProfile, language, setLanguage, user } = useAppContext();
  const navigate = useNavigate();
  const [audio, setAudio] = useState<{ base64: string; mime: string } | null>(null);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const welcomeAudioRequested = useRef(false);
  const welcomeAudioPlayStarted = useRef(false);
  const welcomeAudioSessionKey = `tech-sahaya-welcome-audio:${user?.id || "unknown"}`;

  useEffect(() => {
    return () => {
      stopAllPlayback();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (welcomeAudioRequested.current || sessionStorage.getItem(welcomeAudioSessionKey) === "played") return;
    welcomeAudioRequested.current = true;
    api.post("/api/onboarding/welcome-audio", null, { params: { language } })
      .then((response) => {
        if (!isMounted) return;
        const nextAudio = { base64: response.data.audio_base64, mime: response.data.audio_mime || "audio/wav" };
        setAudio(nextAudio);
        if (!hasActivePlayback() && nextAudio.base64) {
          const player = new Audio(`data:${nextAudio.mime};base64,${nextAudio.base64}`);
          audioRef.current = player;
          welcomeAudioPlayStarted.current = true;
          playExclusiveAudio(
            player,
            () => {
              sessionStorage.setItem(welcomeAudioSessionKey, "played");
              if (isMounted) setAudioError(false);
            },
            () => { welcomeAudioPlayStarted.current = false; },
            () => {
              welcomeAudioPlayStarted.current = false;
              if (isMounted) setAudioError(true);
            }
          ).catch(() => {
            welcomeAudioPlayStarted.current = false;
            if (isMounted) setAudioError(true);
          });
        } else if (hasActivePlayback()) {
          if (isMounted) setAudioError(true);
        }
      })
      .catch(() => {
        if (isMounted) setAudioError(true);
      });

    return () => {
      isMounted = false;
    };
  }, [language, welcomeAudioSessionKey]);

  const playWelcome = () => {
    if (!audio) return;
    welcomeAudioPlayStarted.current = true;
    const player = new Audio(`data:${audio.mime};base64,${audio.base64}`);
    audioRef.current = player;
    setAudioError(false);
    playExclusiveAudio(
      player,
      () => setAudioError(false),
      () => { welcomeAudioPlayStarted.current = false; },
      () => {
        welcomeAudioPlayStarted.current = false;
        setAudioError(true);
      }
    ).catch(() => {
      welcomeAudioPlayStarted.current = false;
      setAudioError(true);
    });
  };

  return (
    <div className="rounded-3xl bg-white p-6 shadow-card">
      <h1 className="text-3xl font-bold">{t(language, "welcomeTitle")}</h1>
      <p className="mt-2 text-slate-600">{t(language, "welcomeSubtitle")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold" htmlFor="onboarding-language">{t(language, "preferredLanguage")}</label>
        <LanguageSelect id="onboarding-language" value={language} onChange={setLanguage} />
        {audio && audioError && <button type="button" onClick={playWelcome} className="inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 font-semibold text-sahaya-green"><Volume2 size={18} /> {t(language, "playWelcome")}</button>}
      </div>
      <div className="mt-6">
        <ProfileForm initialValue={profile} submitLabel={t(language, "saveAndContinue")} onSubmit={async (nextProfile) => {
          const response = await api.put("/api/profile", { ...nextProfile, preferred_language: language, consent_given: true });
          setProfile({ ...nextProfile, onboarding_completed: response.data.onboarding_completed });
          navigate("/dashboard");
        }} />
      </div>
    </div>
  );
}
