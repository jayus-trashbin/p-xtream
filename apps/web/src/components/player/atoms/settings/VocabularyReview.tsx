import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { useVocabularyStore } from "@/stores/vocabulary";

export function VocabularyReview() {
  const { t } = useTranslation();
  const items = useVocabularyStore((s) => s.items);
  const reviewWord = useVocabularyStore((s) => s.reviewWord);

  const [activeWordId, setActiveWordId] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  // Compute items that need review right now
  const dueItems = useMemo(() => {
    const now = Date.now();
    return Object.values(items)
      .filter((item) => item.nextReviewAt <= now)
      .sort((a, b) => a.nextReviewAt - b.nextReviewAt);
  }, [items]);

  const totalWords = Object.keys(items).length;

  const startReview = () => {
    const first = dueItems[0];
    if (first) {
      setActiveWordId(first.id);
      setShowAnswer(false);
    }
  };

  const handleReview = (quality: number) => {
    if (!activeWordId) return;
    reviewWord(activeWordId, quality);
    setShowAnswer(false);

    // Find next word
    const nextDue = Object.values(useVocabularyStore.getState().items)
      .filter((item) => item.nextReviewAt <= Date.now() && item.id !== activeWordId)
      .sort((a, b) => a.nextReviewAt - b.nextReviewAt);

    const nextItem = nextDue[0];
    if (nextItem) {
      setActiveWordId(nextItem.id);
    } else {
      setActiveWordId(null);
    }
  };

  if (activeWordId) {
    const word = items[activeWordId];
    if (!word) return null;

    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 max-w-2xl mx-auto text-center space-y-8 absolute inset-0 z-50 bg-black/80 backdrop-blur-md rounded-2xl border border-white/10 m-4">
        <div className="w-full text-left">
          <span className="text-xs uppercase tracking-wider text-type-secondary font-bold">
            {word.language}
          </span>
          <h2 className="text-5xl font-bold text-white mt-2">{word.word}</h2>
          {word.phonetic && (
            <p className="text-type-secondary font-mono mt-1">{word.phonetic}</p>
          )}
        </div>

        <div
          className={`flex-1 w-full bg-white/5 border border-white/10 rounded-xl p-6 transition-all duration-300 ${
            showAnswer ? "opacity-100 blur-none" : "opacity-0 blur-md pointer-events-none"
          }`}
        >
          <p className="text-lg text-white mb-4">{word.definition}</p>
          {word.example && (
            <p className="text-white/60 italic border-l-2 border-[#9D4EDD] pl-4 text-left">
              "{word.example}"
            </p>
          )}
        </div>

        <div className="w-full pt-6">
          {!showAnswer ? (
            <Button theme="purple" className="w-full py-4 text-lg" onClick={() => setShowAnswer(true)}>
              {t("languageReactor.showAnswer", "Mostrar Resposta")}
            </Button>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              <Button theme="danger" onClick={() => handleReview(1)}>
                {t("languageReactor.again", "Errei (Denovo)")}
              </Button>
              <Button theme="secondary" onClick={() => handleReview(3)}>
                {t("languageReactor.hard", "Difícil")}
              </Button>
              <Button theme="purple" onClick={() => handleReview(4)}>
                {t("languageReactor.good", "Bom")}
              </Button>
              <Button theme="white" onClick={() => handleReview(5)}>
                {t("languageReactor.easy", "Fácil")}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-white mt-6">
        {t("languageReactor.vocabularyTitle", "Meu Vocabulário")}
      </h2>
      <p className="text-type-secondary mt-6">
        {t(
          "languageReactor.vocabularyDesc",
          "Revise as palavras que você aprendeu usando o sistema Spaced Repetition.",
        )}
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-video-context-buttons-list p-6 rounded-2xl border border-white/5">
          <p className="text-sm text-type-secondary uppercase tracking-wider mb-1">
            {t("languageReactor.totalWords", "Total de Palavras")}
          </p>
          <p className="text-4xl font-bold text-white">{totalWords}</p>
        </div>
        <div className="bg-video-context-buttons-list p-6 rounded-2xl border border-white/5">
          <p className="text-sm text-type-secondary uppercase tracking-wider mb-1">
            {t("languageReactor.dueReviews", "Revisões Pendentes")}
          </p>
          <p className={`text-4xl font-bold ${dueItems.length > 0 ? "text-[#F97316]" : "text-onboarding-best"}`}>
            {dueItems.length}
          </p>
        </div>
      </div>

      <div className="pt-6 border-t border-white/10">
        <Button
          theme={dueItems.length > 0 ? "purple" : "secondary"}
          disabled={dueItems.length === 0}
          onClick={startReview}
          className="w-full py-3"
        >
          {dueItems.length > 0
            ? t("languageReactor.startReview", "Começar Revisão")
            : t("languageReactor.noReviews", "Tudo revisado por hoje!")}
        </Button>
      </div>
    </div>
  );
}
