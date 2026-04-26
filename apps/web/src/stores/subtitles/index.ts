import merge from "lodash.merge";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { isFirefox } from "@/utils/detectFeatures";

export interface SubtitleStyling {
  /**
   * Text color of subtitles, hex string
   */
  color: string;

  /**
   * size percentage, ranges between 0.01 and 2
   */
  size: number;

  /**
   * background opacity, ranges between 0 and 1
   */
  backgroundOpacity: number;

  /**
   * background blur, ranges between 0 and 1
   */
  backgroundBlur: number;

  /**
   * whether background blur is enabled (disabled by default on Firefox due to flickering issues)
   */
  backgroundBlurEnabled: boolean;

  /**
   * bold, boolean
   */
  bold: boolean;

  /**
   * vertical position percentage, ranges between 1 and 3 (rem)
   */
  verticalPosition: number;

  /**
   * font style for text rendering
   * "default" | "raised" | "depressed" | "Border" | "dropShadow"
   */
  fontStyle: string;

  /**
   * border thickness for Border font style, ranges between 0 and 10
   */
  borderThickness: number;
}

export interface SubtitleStore {
  lastSync: {
    lastSelectedLanguage: string | null;
  };
  enabled: boolean;
  lastSelectedLanguage: string | null;
  lastSelectedSubtitleId: string | null;
  isOpenSubtitles: boolean;
  styling: SubtitleStyling;
  overrideCasing: boolean;
  delay: number;
  showDelayIndicator: boolean;
  // Dual Subtitles
  dualEnabled: boolean;
  dualPosition: "stacked" | "split";
  dualSecondaryStyling: SubtitleStyling;
  setDualEnabled(enabled: boolean): void;
  setDualPosition(position: "stacked" | "split"): void;
  updateSecondaryStyling(newStyling: Partial<SubtitleStyling>): void;
  // Language Reactor
  languageReactorEnabled: boolean;
  languageReactorOnboarded: boolean;
  studyLanguage: string | null;
  nativeLanguage: string;
  highlightUnknownWords: boolean;
  autoPauseOnSubtitle: boolean;
  ttsProvider: "webspeech" | "google";
  dictionaryProvider: "wiktionary" | "google" | "none";
  setLanguageReactorEnabled(enabled: boolean): void;
  setLanguageReactorOnboarded(onboarded: boolean): void;
  setStudyLanguage(lang: string | null): void;
  setNativeLanguage(lang: string): void;
  setHighlightUnknownWords(enabled: boolean): void;
  setAutoPauseOnSubtitle(enabled: boolean): void;
  setTtsProvider(provider: "webspeech" | "google"): void;
  setDictionaryProvider(provider: "wiktionary" | "google" | "none"): void;
  showLanguageReactorWizard: boolean;
  setShowLanguageReactorWizard(show: boolean): void;

  updateStyling(newStyling: Partial<SubtitleStyling>): void;
  resetStyling(): void;
  setSubtitle(
    enabled: boolean,
    language?: string | null,
    subtitleId?: string | null,
  ): void;
  setIsOpenSubtitles(isOpenSubtitles: boolean): void;
  setOverrideCasing(enabled: boolean): void;
  setDelay(delay: number): void;
  importSubtitleLanguage(lang: string | null): void;
  resetSubtitleSpecificSettings(): void;
  setShowDelayIndicator: (show: boolean) => void;
}

export const useSubtitleStore = create(
  persist(
    immer<SubtitleStore>((set) => ({
      enabled: false,
      lastSync: {
        lastSelectedLanguage: null,
      },
      lastSelectedLanguage: null,
      lastSelectedSubtitleId: null,
      isOpenSubtitles: false,
      overrideCasing: false,
      delay: 0,
      styling: {
        color: "#ffffff",
        backgroundOpacity: 0.5,
        size: 1,
        backgroundBlur: 0.5,
        backgroundBlurEnabled: !isFirefox,
        bold: false,
        verticalPosition: 1,
        fontStyle: "default",
        borderThickness: 1,
      },
      dualEnabled: false,
      dualPosition: "stacked",
      dualSecondaryStyling: {
        color: "#ffff00",
        backgroundOpacity: 0.5,
        size: 0.8,
        backgroundBlur: 0.5,
        backgroundBlurEnabled: !isFirefox,
        bold: false,
        verticalPosition: 2.5,
        fontStyle: "default",
        borderThickness: 1,
      },
      languageReactorEnabled: false,
      languageReactorOnboarded: false,
      studyLanguage: null,
      nativeLanguage: "pt-BR",
      highlightUnknownWords: true,
      autoPauseOnSubtitle: false,
      ttsProvider: "webspeech",
      dictionaryProvider: "wiktionary",
      showDelayIndicator: false,
      showLanguageReactorWizard: false,
      resetSubtitleSpecificSettings() {
        set((s) => {
          s.delay = 0;
          s.overrideCasing = false;
        });
      },
      setIsOpenSubtitles(isOpenSubtitles) {
        set((s) => {
          s.isOpenSubtitles = isOpenSubtitles;
        });
      },
      updateStyling(newStyling) {
        set((s) => {
          if (newStyling.backgroundOpacity !== undefined)
            s.styling.backgroundOpacity = Math.min(
              1,
              Math.max(0, newStyling.backgroundOpacity),
            );
          if (newStyling.backgroundBlur !== undefined)
            s.styling.backgroundBlur = Math.min(
              1,
              Math.max(0, newStyling.backgroundBlur),
            );
          if (newStyling.backgroundBlurEnabled !== undefined)
            s.styling.backgroundBlurEnabled = newStyling.backgroundBlurEnabled;
          if (newStyling.color !== undefined)
            s.styling.color = newStyling.color.toLowerCase();
          if (newStyling.size !== undefined)
            s.styling.size = Math.min(10, Math.max(0.01, newStyling.size));
          if (newStyling.bold !== undefined) s.styling.bold = newStyling.bold;
          if (newStyling.verticalPosition !== undefined)
            s.styling.verticalPosition = Math.min(
              100,
              Math.max(0, newStyling.verticalPosition),
            );
          if (newStyling.fontStyle !== undefined)
            s.styling.fontStyle = newStyling.fontStyle;
          if (newStyling.borderThickness !== undefined)
            s.styling.borderThickness = Math.min(
              10,
              Math.max(0, newStyling.borderThickness),
            );
        });
      },
      updateSecondaryStyling(newStyling) {
        set((s) => {
          if (newStyling.backgroundOpacity !== undefined)
            s.dualSecondaryStyling.backgroundOpacity = Math.min(
              1,
              Math.max(0, newStyling.backgroundOpacity),
            );
          if (newStyling.backgroundBlur !== undefined)
            s.dualSecondaryStyling.backgroundBlur = Math.min(
              1,
              Math.max(0, newStyling.backgroundBlur),
            );
          if (newStyling.backgroundBlurEnabled !== undefined)
            s.dualSecondaryStyling.backgroundBlurEnabled = newStyling.backgroundBlurEnabled;
          if (newStyling.color !== undefined)
            s.dualSecondaryStyling.color = newStyling.color.toLowerCase();
          if (newStyling.size !== undefined)
            s.dualSecondaryStyling.size = Math.min(10, Math.max(0.01, newStyling.size));
          if (newStyling.bold !== undefined) s.dualSecondaryStyling.bold = newStyling.bold;
          if (newStyling.verticalPosition !== undefined)
            s.dualSecondaryStyling.verticalPosition = Math.min(
              100,
              Math.max(0, newStyling.verticalPosition),
            );
          if (newStyling.fontStyle !== undefined)
            s.dualSecondaryStyling.fontStyle = newStyling.fontStyle;
          if (newStyling.borderThickness !== undefined)
            s.dualSecondaryStyling.borderThickness = Math.min(
              10,
              Math.max(0, newStyling.borderThickness),
            );
        });
      },
      resetStyling() {
        set((s) => {
          s.styling = {
            color: "#ffffff",
            backgroundOpacity: 0.5,
            size: 1,
            backgroundBlur: 0.5,
            backgroundBlurEnabled: !isFirefox,
            bold: false,
            verticalPosition: 1,
            fontStyle: "default",
            borderThickness: 1,
          };
        });
      },
      setSubtitle(enabled, language, subtitleId) {
        set((s) => {
          s.enabled = enabled;
          if (enabled) {
            s.lastSelectedLanguage = language ?? null;
            s.lastSelectedSubtitleId = subtitleId ?? null;
          } else {
            s.lastSelectedLanguage = null;
            s.lastSelectedSubtitleId = null;
          }
        });
      },
      setOverrideCasing(enabled) {
        set((s) => {
          s.overrideCasing = enabled;
        });
      },
      setDelay(delay) {
        set((s) => {
          s.delay = Math.max(Math.min(500, delay), -500);
        });
      },
      importSubtitleLanguage(lang) {
        set((s) => {
          s.lastSelectedLanguage = lang;
          s.lastSync.lastSelectedLanguage = lang;
        });
      },
      setShowDelayIndicator(show: boolean) {
        set((s) => {
          s.showDelayIndicator = show;
        });
      },
      setDualEnabled(enabled) { set((s) => { s.dualEnabled = enabled; }); },
      setDualPosition(position) { set((s) => { s.dualPosition = position; }); },
      setLanguageReactorEnabled(enabled) { set((s) => { s.languageReactorEnabled = enabled; }); },
      setLanguageReactorOnboarded(onboarded) { set((s) => { s.languageReactorOnboarded = onboarded; }); },
      setStudyLanguage(lang) { set((s) => { s.studyLanguage = lang; }); },
      setNativeLanguage(lang) { set((s) => { s.nativeLanguage = lang; }); },
      setHighlightUnknownWords(enabled) { set((s) => { s.highlightUnknownWords = enabled; }); },
      setAutoPauseOnSubtitle(enabled) { set((s) => { s.autoPauseOnSubtitle = enabled; }); },
      setTtsProvider(provider) { set((s) => { s.ttsProvider = provider; }); },
      setDictionaryProvider(provider) { set((s) => { s.dictionaryProvider = provider; }); },
      setShowLanguageReactorWizard(show) { set((s) => { s.showLanguageReactorWizard = show; }); },
    })),
    {
      name: "__MW::subtitles",
      merge: (persisted, current) => merge({}, current, persisted),
    },
  ),
);
