import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  Compass,
  FileCheck2,
  Mic,
  MicOff,
  Minimize2,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { useTour } from "../context/TourContext";
import { api } from "../services/api";
import { t } from "../utils/i18n";
import { cleanTextForSpeech, languageToBCP47 } from "../utils/speechUtils";
import { SUPPORTED_LANGUAGES } from "../utils/languages";
import { LanguageSelect } from "./LanguageSelect";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  evidence?: Array<{
    scheme_name: string;
    evidence: string;
    source: string;
    retrieval_score: number;
  }>;
  confidence?: string;
  verificationStatus?: string;
  tourId?: string | null;
  suggestedAction?: {
    type: string;
    tour_id: string;
    title: string;
    description: string;
    route: string;
  } | null;
  audioBase64?: string | null;
  audioMime?: string;
}

function FormattedMessageText({ text, isUser }: { text: string; isUser: boolean }) {
  if (isUser) {
    return <p className="whitespace-pre-line text-sm leading-relaxed">{text}</p>;
  }

  const lines = text.split("\n");

  const renderInlineStyles = (str: string) => {
    const parts = str.split(/(\[.*?\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+|\*\*.*?\*\*|\*.*?\*)/g);
    return parts.map((part, i) => {
      if (!part) return null;

      const mdLinkMatch = part.match(/^\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/);
      if (mdLinkMatch) {
        return (
          <a
            key={i}
            href={mdLinkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-700 underline font-medium hover:text-emerald-900"
          >
            {mdLinkMatch[1]}
          </a>
        );
      }

      if (/^https?:\/\/[^\s)]+$/.test(part)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-700 underline break-all font-medium hover:text-emerald-900"
          >
            {part}
          </a>
        );
      }

      if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
        return (
          <strong key={i} className="font-bold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }

      if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
        return (
          <em key={i} className="italic text-slate-500">
            {part.slice(1, -1)}
          </em>
        );
      }

      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-1 text-sm leading-relaxed text-slate-800">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-0.5" />;
        }

        if (trimmed.startsWith("**") && trimmed.endsWith("**") && !trimmed.includes(":")) {
          return (
            <div key={idx} className="font-bold text-sm text-emerald-900 pb-1 pt-0.5 border-b border-stone-100">
              {trimmed.replace(/\*\*/g, "")}
            </div>
          );
        }

        if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
          const content = trimmed.replace(/^[•\-]\s*/, "");
          return (
            <div key={idx} className="flex items-start gap-2 pl-0.5">
              <span className="text-emerald-600 font-bold select-none text-xs mt-0.5">•</span>
              <div className="flex-1">{renderInlineStyles(content)}</div>
            </div>
          );
        }

        return <p key={idx}>{renderInlineStyles(trimmed)}</p>;
      })}
    </div>
  );
}

export function FloatingChatWidget() {

  const { language, setLanguage, user } = useAppContext();
  const { startTour } = useTour();

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "Namaste! I am Sahaya, your citizen welfare assistant. Ask me anything about government schemes, eligibility criteria, or document preparation in English, Hindi, or Kannada.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, loading]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setLoading(true);

    try {
      const res = await api.post("/api/chat", {
        message: query,
        language: language || "en",
      });

      const data = res.data;
      const assistantMessage: Message = {
        id: `asst-${Date.now()}`,
        sender: "assistant",
        text: data.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        evidence: data.evidence,
        confidence: data.confidence,
        verificationStatus: data.verification_status,
        tourId: data.tour_id,
        suggestedAction: data.suggested_action,
        audioBase64: data.audio_base64,
        audioMime: data.audio_mime || "audio/wav",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const isRateLimit = err?.response?.status === 429;
      const retryAfter = err?.response?.headers?.["retry-after"] || "a few";
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        sender: "assistant",
        text: isRateLimit
          ? `You have sent too many requests. Please wait ${retryAfter} seconds before asking again.`
          : "I am having trouble connecting to the Sahaya service right now. Please try again or browse schemes from the navigation menu.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert(t(language, "voiceUnavailable"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        await handleVoiceUpload(audioBlob);
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Microphone access failed", err);
      alert(t(language, "voicePermissionError"));
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const handleVoiceUpload = async (audioBlob: Blob) => {
    setLoading(true);
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
      const base64Data = (reader.result as string).split(",")[1];
      try {
        const res = await api.post("/api/voice-chat", {
          audio_base64: base64Data,
          language: language || "en",
        });

        const data = res.data;
        const transcriptText = data.transcript || "Voice Message";

        // Add user transcript
        const userMsg: Message = {
          id: `user-voice-${Date.now()}`,
          sender: "user",
          text: transcriptText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        const asstData = data.response;
        const asstMsg: Message = {
          id: `asst-voice-${Date.now()}`,
          sender: "assistant",
          text: asstData?.answer || "Processed your voice request.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          evidence: asstData?.evidence,
          confidence: asstData?.confidence,
          verificationStatus: asstData?.verification_status,
          tourId: asstData?.tour_id,
          suggestedAction: asstData?.suggested_action,
          audioBase64: data.audio_base64,
          audioMime: data.audio_mime || "audio/wav",
        };

        setMessages((prev) => [...prev, userMsg, asstMsg]);

        // Auto-play returned Sarvam TTS audio if present
        if (data.audio_base64) {
          playAudio(asstMsg.id, data.audio_base64, data.audio_mime || "audio/wav");
        } else if ("speechSynthesis" in window && asstData?.answer) {
          // Browser TTS fallback
          const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(asstData.answer));
          utterance.lang = languageToBCP47(language);
          window.speechSynthesis.speak(utterance);
        }
      } catch (err: any) {
        console.error("Voice chat error", err);
        const errorMsg: Message = {
          id: `err-voice-${Date.now()}`,
          sender: "assistant",
          text: "Voice processing failed. Please type your query in the chat box below.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    };
  };

  const playAudio = (msgId: string, base64Audio: string, mime: string = "audio/wav") => {
    if (playingAudioId === msgId && currentAudioElementRef.current) {
      currentAudioElementRef.current.pause();
      setPlayingAudioId(null);
      return;
    }

    if (currentAudioElementRef.current) {
      currentAudioElementRef.current.pause();
    }

    const audio = new Audio(`data:${mime};base64,${base64Audio}`);
    currentAudioElementRef.current = audio;
    setPlayingAudioId(msgId);

    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => setPlayingAudioId(null);
    audio.play().catch(() => setPlayingAudioId(null));
  };

  const triggerTour = (tourId: string) => {
    const success = startTour(tourId);
    if (success) {
      setIsOpen(false); // Minimize chat to reveal spotlight
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-[60]">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            data-tour="floating-chat-btn"
            className="group relative flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-xl hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all duration-200"
            aria-label="Open Ask Sahaya Chatbot"
          >
            <Bot size={28} className="transition-transform group-hover:rotate-6" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-white" />
            </span>
          </button>
        </div>
      )}

      {/* Floating Chat Drawer Panel */}
      {isOpen && (
        <div
          className="fixed bottom-5 right-5 z-[60] flex h-[600px] max-h-[88vh] w-[420px] max-w-[94vw] flex-col rounded-3xl border border-emerald-100 bg-white shadow-2xl overflow-hidden font-sans animate-in slide-in-from-bottom-6 duration-200"
          role="region"
          aria-label="Ask Sahaya Chat Assistant"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-emerald-700 px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-white">
                <Bot size={20} />
              </div>
              <div>
                <div className="text-sm font-bold leading-tight">{t(language, "askSahaya")}</div>
                <div className="text-[11px] text-emerald-200 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  {t(language, "voiceAndRagAssisted")}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <LanguageSelect
                ariaLabel="Chat Language"
                value={language}
                onChange={setLanguage}
                showEnglishLabel={false}
                className="rounded-lg border border-white/20 bg-emerald-800/80 px-2 py-1 text-xs text-white focus:outline-none cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition"
                aria-label="Minimize Chat"
              >
                <Minimize2 size={16} />
              </button>
            </div>
          </div>

          {/* Message History */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50/70">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-emerald-600 text-white rounded-br-none shadow-sm"
                      : "bg-white text-slate-800 border border-stone-200/80 rounded-bl-none shadow-sm"
                  }`}
                >
                  <FormattedMessageText text={msg.text} isUser={msg.sender === "user"} />


                  {/* Audio Player Button for Assistant Voice */}
                  {msg.audioBase64 && msg.sender === "assistant" && (
                    <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => playAudio(msg.id, msg.audioBase64!, msg.audioMime)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition"
                      >
                        {playingAudioId === msg.id ? (
                          <>
                            <Square size={13} className="fill-emerald-700" /> {t(language, "stopAudio")}
                          </>
                        ) : (
                          <>
                            <Volume2 size={14} /> {t(language, "playVoice")}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Evidence & Confidence Metadata Badges */}
                  {msg.evidence && msg.evidence.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-stone-100 text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-700">
                        <FileCheck2 size={13} />
                        {t(language, "verifiedSourceEvidence")} ({msg.confidence?.toUpperCase()} {t(language, "confidenceLevel")})
                      </div>
                      <div className="mt-1 text-slate-600 line-clamp-2 italic">
                        "{msg.evidence[0].evidence}"
                      </div>
                    </div>
                  )}
                </div>

                {/* Suggested Action / Spotlight Guided Tour Chip */}
                {msg.suggestedAction && msg.suggestedAction.tour_id && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => triggerTour(msg.suggestedAction!.tour_id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100 hover:border-emerald-400 transition animate-bounce"
                    >
                      <Compass size={14} className="text-emerald-600" />
                      {msg.suggestedAction.title}
                    </button>
                  </div>
                )}

                <span className="mt-1 text-[10px] text-slate-400 px-1">{msg.timestamp}</span>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 bg-white p-3 rounded-2xl border w-fit">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                {t(language, "retrievingEvidence")}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Suggestions */}
          <div className="px-3 py-1.5 bg-stone-100/80 border-t flex gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
            <button
              type="button"
              onClick={() => handleSend(t(language, "farmerSchemesQuery"))}
              className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border transition"
            >
              {t(language, "farmerSchemesChip")}
            </button>
            <button
              type="button"
              onClick={() => handleSend(t(language, "uploadDocsQuery"))}
              className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border transition"
            >
              {t(language, "uploadDocsChip")}
            </button>
            <button
              type="button"
              onClick={() => handleSend(t(language, "missedBenefitsQuery"))}
              className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border transition"
            >
              {t(language, "missedBenefitsChip")}
            </button>
          </div>

          {/* Input & Voice Controls */}
          <div className="p-3 bg-white border-t border-stone-200">
            {recording ? (
              <div className="flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-2.5">
                <div className="flex items-center gap-2 text-rose-700 text-xs font-semibold">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-600 animate-ping" />
                  {t(language, "listeningPrompt")} {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeLabel || language.toUpperCase()}
                </div>
                <button
                  type="button"
                  onClick={stopVoiceRecording}
                  className="rounded-xl bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
                >
                  Done
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition"
                  title="Speak query (Sarvam AI Voice)"
                  aria-label="Record voice query"
                >
                  <Mic size={18} />
                </button>

                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={t(language, "chatPlaceholder")}
                  className="flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  disabled={loading}
                />

                <button
                  type="submit"
                  disabled={!inputText.trim() || loading}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40 transition"
                  aria-label="Send message"
                >
                  <Send size={16} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
