export interface Token {
  id: string;
  text: string;
  index: number;
  isWordLike: boolean;
}

export function tokenizeText(
  text: string,
  locale: string = "en",
): Token[] {
  if (!text) return [];

  // Use Intl.Segmenter to accurately segment text, especially for CJK languages
  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    const segments = Array.from(segmenter.segment(text));
    
    return segments.map((seg, index) => ({
      id: `${index}-${seg.segment}`,
      text: seg.segment,
      index: seg.index,
      isWordLike: seg.isWordLike,
    }));
  } catch (error) {
    console.error("Intl.Segmenter not supported or failed, falling back to simple regex", error);
    // Fallback for older browsers
    const words = text.split(/(\s+|[.,;!?()[\]{}'"]+)/g).filter(Boolean);
    let currentIndex = 0;
    return words.map((word, i) => {
      const isWordLike = /\w/.test(word);
      const token = {
        id: `${i}-${word}`,
        text: word,
        index: currentIndex,
        isWordLike,
      };
      currentIndex += word.length;
      return token;
    });
  }
}
