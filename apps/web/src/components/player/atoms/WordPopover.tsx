import { useEffect, useState } from "react";
import { DictionaryDefinition, lookupWord } from "../utils/dictionary";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/buttons/Button";
import { useVocabularyStore } from "@/stores/vocabulary";

interface WordPopoverProps {
  word: string;
  language: string;
  x: number;
  y: number;
  onClose: () => void;
}

export function WordPopover({ word, language, x, y, onClose }: WordPopoverProps) {
  const { t } = useTranslation();
  const [definition, setDefinition] = useState<DictionaryDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    lookupWord(word, language).then((res) => {
      if (mounted) {
        setDefinition(res);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [word, language]);

  return (
    <div
      className="fixed z-[70] p-4 bg-black/90 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl w-80 text-white font-sans transition-all"
      style={{
        left: Math.min(x, window.innerWidth - 340), // keep on screen
        bottom: window.innerHeight - y + 10, // display above the word
      }}
      // Stop propagation so clicking inside the popover doesn't trigger player controls
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex justify-between items-start mb-2 border-b border-white/10 pb-2">
        <div>
          <h3 className="text-xl font-bold font-serif flex items-center gap-2">
            {word}
            <button
              onClick={() => {
                const utterance = new SpeechSynthesisUtterance(word);
                utterance.lang = language;
                window.speechSynthesis.speak(utterance);
              }}
              className="text-white/50 hover:text-[#0D9488] transition-colors p-1"
              title={t("languageReactor.speakWord", "Ouvir palavra")}
            >
              🔊
            </button>
          </h3>
          {definition?.phonetic && (
            <span className="text-sm text-[#0D9488] font-mono">
              {definition.phonetic}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-white/50 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="max-h-48 overflow-y-auto pr-2 custom-scrollbar">
        {loading ? (
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-4 py-1">
              <div className="h-2 bg-white/20 rounded"></div>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  <div className="h-2 bg-white/20 rounded col-span-2"></div>
                  <div className="h-2 bg-white/20 rounded col-span-1"></div>
                </div>
                <div className="h-2 bg-white/20 rounded"></div>
              </div>
            </div>
          </div>
        ) : definition ? (
          <div className="space-y-4">
            {definition.meanings.map((meaning, i) => (
              <div key={i}>
                <span className="text-xs uppercase tracking-wider text-[#F97316] font-bold mb-1 block">
                  {meaning.partOfSpeech}
                </span>
                <ul className="list-disc pl-4 text-sm text-white/80 space-y-2">
                  {meaning.definitions.slice(0, 3).map((def, j) => (
                    <li key={j}>
                      {def.definition}
                      {def.example && (
                        <p className="text-white/40 italic mt-1 text-xs">
                          "{def.example}"
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/50 py-4 text-center">
            {t("languageReactor.wordNotFound", "Definição não encontrada.")}
          </p>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          theme="purple"
          className="flex-1 text-xs py-1.5"
          onClick={() => {
            const definitionText = definition?.meanings[0]?.definitions[0]?.definition || "-";
            const phonetic = definition?.phonetic;
            const example = definition?.meanings[0]?.definitions[0]?.example;
            useVocabularyStore.getState().addWord(word, language, definitionText, phonetic, example);
            alert(t("languageReactor.addedToVocabulary", "Adicionado ao vocabulário!"));
            onClose();
          }}
        >
          {t("languageReactor.addToVocab", "+ Vocabulário")}
        </Button>
      </div>
    </div>
  );
}
