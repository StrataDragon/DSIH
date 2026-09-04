import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bot, X, ChevronRight, Check } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";

export type TourStep = {
  target: string;
  message: string;
  placement?: "top" | "bottom" | "left" | "right";
  route?: string; // Add route support for cross-page tours
};

type GuidedTourProps = {
  steps: TourStep[];
  onComplete: () => void;
};

export function GuidedTour({ steps, onComplete }: GuidedTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    const saved = sessionStorage.getItem("techSahayaTourStepIndex");
    const parsed = saved ? parseInt(saved, 10) : 0;
    return parsed >= 0 && parsed < steps.length ? parsed : 0;
  });
  
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useAppContext();

  useEffect(() => {
    if (currentStepIndex >= steps.length) {
      setCurrentStepIndex(0);
      sessionStorage.setItem("techSahayaTourStepIndex", "0");
    } else {
      sessionStorage.setItem("techSahayaTourStepIndex", currentStepIndex.toString());
    }
  }, [currentStepIndex, steps.length]);

  const step = steps[currentStepIndex] || steps[0];

  useEffect(() => {
    if (!step) return;

    // Handle cross-page navigation
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
      return; // wait for navigation to complete
    }

    let isSubscribed = true;
    let attempts = 0;
    let hasScrolled = false;

    const updatePosition = () => {
      if (!isSubscribed) return;
      const el = document.querySelector(step.target);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
        
        // Only scroll into view once per step to prevent infinite scroll-loop freezes
        if (!hasScrolled) {
          hasScrolled = true;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        setTargetRect(null);
        if (attempts < 20) { // poll for up to 2 seconds if element isn't found immediately (e.g. loading)
          attempts++;
          setTimeout(updatePosition, 100);
        }
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    
    return () => {
      isSubscribed = false;
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [currentStepIndex, step, location.pathname, navigate]);

  if (!step) return null;

  // Calculate mascot position based on target rect
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;

  if (targetRect) {
    const placement = step.placement || "right";
    const gap = 20;
    
    if (placement === "right") {
      x = targetRect.right + gap;
      y = targetRect.top + targetRect.height / 2 - 50; // Center vertically relative to mascot
    } else if (placement === "left") {
      x = targetRect.left - gap - 360; // ~360 is rough width of mascot + bubble
      y = targetRect.top + targetRect.height / 2 - 50;
    } else if (placement === "bottom") {
      x = targetRect.left + targetRect.width / 2 - 150;
      y = targetRect.bottom + gap;
    } else if (placement === "top") {
      x = targetRect.left + targetRect.width / 2 - 150;
      y = targetRect.top - gap - 150;
    }
    
    // Clamp to screen bounds to prevent speech bubble clipping
    x = Math.max(10, Math.min(x, window.innerWidth - 380));
    y = Math.max(10, Math.min(y, window.innerHeight - 200));
  }

  const handleDone = () => {
    sessionStorage.removeItem("techSahayaTourActive");
    sessionStorage.removeItem("techSahayaTourStepIndex");
    onComplete();
  };

  const nextStep = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      handleDone();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="mascot-container"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1, x, y }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
        className="fixed top-0 left-0 z-[9999] pointer-events-auto flex items-end gap-3"
      >
        {/* Mascot */}
        <div className="relative">
          <motion.div 
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="rounded-full bg-blue-600 p-3 shadow-[0_0_20px_rgba(37,99,235,0.4)] border-4 border-white text-white flex items-center justify-center"
          >
            <Bot size={32} />
          </motion.div>
        </div>

        {/* Speech Bubble */}
        <div className="relative mb-6 rounded-2xl bg-white p-4 shadow-2xl border-2 border-blue-100 w-72">
          <div className="absolute -left-3 bottom-2 w-0 h-0 border-t-8 border-t-transparent border-r-[12px] border-r-white border-b-8 border-b-transparent" />
          
          <button onClick={handleDone} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600" aria-label="Close tour">
            <X size={16} />
          </button>
          
          <p className="text-sm font-semibold text-slate-800 pr-4 mt-2">
            {step.message}
          </p>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex-1 mr-4">
              <div className="text-[10px] font-bold text-slate-400 mb-1">
                 {currentStepIndex + 1} / {steps.length}
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 rounded-full transition-all duration-300" 
                  style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }} 
                />
              </div>
            </div>
            
            <button 
              onClick={nextStep}
              className="flex-shrink-0 flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition shadow-sm"
            >
              {currentStepIndex === steps.length - 1 ? (
                <>Done <Check size={14} /></>
              ) : (
                <>Next <ChevronRight size={14} /></>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Highlighter Overlay */}
      {targetRect && (
        <motion.div 
          key="highlight-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9998] pointer-events-none mix-blend-hard-light"
          style={{
             background: `radial-gradient(circle at ${targetRect.left + targetRect.width/2}px ${targetRect.top + targetRect.height/2}px, transparent ${Math.max(targetRect.width, targetRect.height)/2 + 20}px, rgba(0,0,0,0.5) ${Math.max(targetRect.width, targetRect.height)/2 + 80}px)`
          }}
        />
      )}
    </AnimatePresence>
  );
}
