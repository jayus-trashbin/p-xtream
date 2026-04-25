import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export interface VocabularyItem {
  id: string;
  word: string;
  language: string;
  definition: string;
  phonetic?: string;
  example?: string;
  addedAt: number;
  // SM-2 algorithm fields for Spaced Repetition
  repetition: number;
  interval: number; // in days
  easiness: number;
  nextReviewAt: number;
}

export interface VocabularyStore {
  items: Record<string, VocabularyItem>;
  addWord: (
    word: string,
    language: string,
    definition: string,
    phonetic?: string,
    example?: string,
  ) => void;
  removeWord: (id: string) => void;
  reviewWord: (id: string, quality: number) => void; // quality: 0-5
}

export const useVocabularyStore = create(
  persist(
    immer<VocabularyStore>((set) => ({
      items: {},
      addWord: (word, language, definition, phonetic, example) => {
        set((s) => {
          const id = `${language}:${word.toLowerCase()}`;
          if (!s.items[id]) {
            s.items[id] = {
              id,
              word,
              language,
              definition,
              ...(phonetic !== undefined ? { phonetic } : {}),
              ...(example !== undefined ? { example } : {}),
              addedAt: Date.now(),
              repetition: 0,
              interval: 1,
              easiness: 2.5,
              nextReviewAt: Date.now(),
            };
          }
        });
      },
      removeWord: (id) => {
        set((s) => {
          delete s.items[id];
        });
      },
      reviewWord: (id, quality) => {
        set((s) => {
          const item = s.items[id];
          if (!item) return;

          // SuperMemo-2 Simple Implementation
          let { repetition, interval, easiness } = item;

          if (quality >= 3) {
            if (repetition === 0) interval = 1;
            else if (repetition === 1) interval = 6;
            else interval = Math.round(interval * easiness);
            repetition += 1;
          } else {
            repetition = 0;
            interval = 1;
          }

          easiness = easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
          easiness = Math.max(1.3, easiness);

          const nextReview = Date.now() + interval * 24 * 60 * 60 * 1000;

          s.items[id] = {
            ...item,
            repetition,
            interval,
            easiness,
            nextReviewAt: nextReview,
          };
        });
      },
    })),
    {
      name: "vocabulary-storage",
    },
  ),
);
