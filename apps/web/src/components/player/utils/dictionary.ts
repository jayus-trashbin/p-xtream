export interface DictionaryDefinition {
  word: string;
  phonetic?: string;
  meanings: {
    partOfSpeech: string;
    definitions: {
      definition: string;
      example?: string;
    }[];
  }[];
}

const cache = new Map<string, DictionaryDefinition | null>();

export async function lookupWord(
  word: string,
  language: string = "en",
): Promise<DictionaryDefinition | null> {
  const cleanWord = word.trim().toLowerCase().replace(/[.,;!?()[\]{}'"]+/g, "");
  if (!cleanWord) return null;

  const cacheKey = `${language}:${cleanWord}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) || null;
  }

  try {
    // API supports primarily English, but has partial support for es, fr, etc.
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/${language}/${encodeURIComponent(cleanWord)}`
    );

    if (!res.ok) {
      cache.set(cacheKey, null);
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      cache.set(cacheKey, null);
      return null;
    }

    const result = data[0] as DictionaryDefinition;
    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Dictionary lookup failed:", error);
    return null;
  }
}
