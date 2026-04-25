import { useMemo, useState } from "react";

import {
  captionIsVisible,
  makeQueId,
  parseSubtitles,
  sanitize,
} from "@/components/player/utils/captions";
import { Transition } from "@/components/utils/Transition";
import { usePlayerStore } from "@/stores/player/store";
import { usePreferencesStore } from "@/stores/preferences";
import { SubtitleStyling, useSubtitleStore } from "@/stores/subtitles";
import { tokenizeText } from "@/components/player/utils/tokenize";
import { WordPopover } from "@/components/player/atoms/WordPopover";

export const wordOverrides: Record<string, string> = {
  // Example: i: "I", but in polish "i" is "and" so this is disabled.
};

export function CaptionCue({
  text,
  styling,
  overrideCasing,
  languageReactorEnabled,
  language,
  onWordClick,
}: {
  text?: string;
  styling: SubtitleStyling;
  overrideCasing: boolean;
  languageReactorEnabled: boolean;
  language: string;
  onWordClick: (word: string, lang: string, x: number, y: number) => void;
}) {
  const parsedHtml = useMemo(() => {
    let textToUse = text;
    if (overrideCasing && text) {
      textToUse = text.slice(0, 1) + text.slice(1).toLowerCase();
    }

    const textWithNewlines = (textToUse || "")
      .split(" ")
      .map((word) => wordOverrides[word] ?? word)
      .join(" ")
      .replaceAll(/ i'/g, " I'")
      .replaceAll(/\r?\n/g, "<br />");

    // https://www.w3.org/TR/webvtt1/#dom-construction-rules
    // added a <br /> for newlines
    const html = sanitize(textWithNewlines, {
      ALLOWED_TAGS: ["c", "b", "i", "u", "span", "ruby", "rt", "br"],
      ADD_TAGS: ["v", "lang"],
      ALLOWED_ATTR: ["title", "lang"],
    });

    return html;
  }, [text, overrideCasing]);

  const getTextEffectStyles = () => {
    switch (styling.fontStyle) {
      case "raised":
        return {
          textShadow: "0 2px 0 rgba(0,0,0,0.8), 0 1.5px 1.5px rgba(0,0,0,0.9)",
        };
      case "depressed":
        return {
          textShadow:
            "0 -2px 0 rgba(0,0,0,0.8), 0 -1.5px 1.5px rgba(0,0,0,0.9)",
        };
      case "Border": {
        const thickness = Math.max(
          0.5,
          Math.min(5, styling.borderThickness || 1),
        );
        const shadowColor = "rgba(0,0,0,0.8)";
        return {
          textShadow: [
            `${thickness}px ${thickness}px 0 ${shadowColor}`,
            `-${thickness}px ${thickness}px 0 ${shadowColor}`,
            `${thickness}px -${thickness}px 0 ${shadowColor}`,
            `-${thickness}px -${thickness}px 0 ${shadowColor}`,
            `${thickness}px 0 0 ${shadowColor}`,
            `-${thickness}px 0 0 ${shadowColor}`,
            `0 ${thickness}px 0 ${shadowColor}`,
            `0 -${thickness}px 0 ${shadowColor}`,
          ].join(", "),
        };
      }
      case "dropShadow":
        return { textShadow: "2.5px 2.5px 4.5px rgba(0,0,0,0.9)" };
      case "default":
      default:
        return { textShadow: "0 2px 4px rgba(0,0,0,0.5)" }; // Default is a light drop shadow
    }
  };

  const textEffectStyles = getTextEffectStyles();

  if (languageReactorEnabled && text) {
    const tokens = tokenizeText(text, language);
    return (
      <p
        className="mb-1 rounded px-4 py-1 text-center leading-normal"
        style={{
          color: styling.color,
          fontSize: `${(1.5 * styling.size).toFixed(2)}em`,
          backgroundColor: `rgba(0,0,0,${styling.backgroundOpacity.toFixed(2)})`,
          backdropFilter:
            styling.backgroundBlurEnabled && styling.backgroundBlur !== 0
              ? `blur(${Math.floor(styling.backgroundBlur * 64)}px)`
              : "none",
          fontWeight: styling.bold ? "bold" : "normal",
          ...textEffectStyles,
        }}
        dir="ltr"
      >
        {tokens.map((token) => (
          <span
            key={token.id}
            className={`${
              token.isWordLike
                ? "cursor-pointer hover:bg-white/20 hover:text-white rounded transition-colors px-0.5"
                : ""
            }`}
            onClick={(e) => {
              if (token.isWordLike) {
                e.stopPropagation();
                // Pause video on word click if autoPause is enabled
                const autoPause = useSubtitleStore.getState().autoPauseOnSubtitle;
                if (autoPause) {
                  usePlayerStore.getState().display?.pause();
                }
                const rect = e.currentTarget.getBoundingClientRect();
                onWordClick(token.text, language, rect.left, rect.top);
              }
            }}
          >
            <bdi>{token.text}</bdi>
          </span>
        ))}
      </p>
    );
  }

  return (
    <p
      className="mb-1 rounded px-4 py-1 text-center leading-normal"
      style={{
        color: styling.color,
        fontSize: `${(1.5 * styling.size).toFixed(2)}em`,
        backgroundColor: `rgba(0,0,0,${styling.backgroundOpacity.toFixed(2)})`,
        backdropFilter:
          styling.backgroundBlurEnabled && styling.backgroundBlur !== 0
            ? `blur(${Math.floor(styling.backgroundBlur * 64)}px)`
            : "none",
        fontWeight: styling.bold ? "bold" : "normal",
        ...textEffectStyles,
      }}
    >
      <span
        // Sanitised a few lines up
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: parsedHtml,
        }}
        dir="ltr"
      />
    </p>
  );
}

export function SubtitleRenderer({
  caption,
  styling,
  delay,
  onWordClick,
}: {
  caption: { srtData: string; language: string } | null;
  styling: SubtitleStyling;
  delay: number;
  onWordClick: (word: string, lang: string, x: number, y: number) => void;
}) {
  const videoTime = usePlayerStore((s) => s.progress.time);
  const overrideCasing = useSubtitleStore((s) => s.overrideCasing);
  const languageReactorEnabled = useSubtitleStore((s) => s.languageReactorEnabled);

  const parsedCaptions = useMemo(
    () => (caption?.srtData ? parseSubtitles(caption.srtData, caption.language) : []),
    [caption?.srtData, caption?.language],
  );

  const visibleCaptions = useMemo(
    () =>
      parsedCaptions.filter(({ start, end }) =>
        captionIsVisible(start, end, delay, videoTime),
      ),
    [parsedCaptions, videoTime, delay],
  );

  if (visibleCaptions.length === 0) return null;

  return (
    <div className="flex flex-col items-center">
      {visibleCaptions.map(({ start, end, content }, i) => (
        <CaptionCue
          key={makeQueId(i, start, end)}
          text={content}
          styling={styling}
          overrideCasing={overrideCasing}
          languageReactorEnabled={languageReactorEnabled}
          language={caption?.language || "en"}
          onWordClick={onWordClick}
        />
      ))}
    </div>
  );
}

export function SubtitleView(props: { controlsShown: boolean }) {
  const primaryCaption = usePlayerStore((s) => s.caption.selected);
  const secondaryCaption = usePlayerStore((s) => s.caption.secondary);
  const source = usePlayerStore((s) => s.source);
  const display = usePlayerStore((s) => s.display);
  const isCasting = display?.getType() === "casting";
  
  const [activeWord, setActiveWord] = useState<{
    word: string;
    lang: string;
    x: number;
    y: number;
  } | null>(null);

  const styling = useSubtitleStore((s) => s.styling);
  const delay = useSubtitleStore((s) => s.delay);
  
  const dualEnabled = useSubtitleStore((s) => s.dualEnabled);
  const dualPosition = useSubtitleStore((s) => s.dualPosition);
  const dualSecondaryStyling = useSubtitleStore((s) => s.dualSecondaryStyling);
  
  const enableNativeSubtitles = usePreferencesStore(
    (s) => s.enableNativeSubtitles,
  );

  // Hide custom captions when native subtitles are enabled
  const shouldUseNativeTrack = enableNativeSubtitles && source !== null;
  if (shouldUseNativeTrack || !primaryCaption || isCasting) return null;

  return (
    <Transition animation="slide-up" show>
      <div
        className={`pointer-events-none z-50 text-white absolute w-full flex items-center transition-[bottom] ${
          dualEnabled && dualPosition === "split"
            ? "flex-col lg:flex-row lg:justify-between px-16"
            : "flex-col"
        }`}
        style={{
          bottom: props.controlsShown
            ? "6rem"
            : `${styling.verticalPosition}rem`,
          transform: "translateZ(0)",
        }}
        dir="ltr"
        onClick={() => setActiveWord(null)} // Click outside to close popover
      >
        {activeWord && (
          <WordPopover
            word={activeWord.word}
            language={activeWord.lang}
            x={activeWord.x}
            y={activeWord.y}
            onClose={() => setActiveWord(null)}
          />
        )}
        <SubtitleRenderer
          caption={primaryCaption as { srtData: string; language: string }}
          styling={styling}
          delay={delay}
          onWordClick={(word, lang, x, y) => setActiveWord({ word, lang, x, y })}
        />
        {dualEnabled && secondaryCaption && (
          <SubtitleRenderer
            caption={secondaryCaption as { srtData: string; language: string }}
            styling={dualSecondaryStyling}
            delay={delay}
            onWordClick={(word, lang, x, y) => setActiveWord({ word, lang, x, y })}
          />
        )}
      </div>
    </Transition>
  );
}
