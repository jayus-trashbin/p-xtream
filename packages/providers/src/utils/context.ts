import { MovieMedia, ShowMedia } from '@/entrypoint/utils/media';
import { FeatureMap } from '@/entrypoint/utils/targets';
import { UseableFetcher } from '@/fetchers/types';

export type ScrapeContext = {
  proxiedFetcher: UseableFetcher;
  fetcher: UseableFetcher;
  progress(val: number): void;
  features: FeatureMap;
  /**
   * Optional debrid API token — passed from the frontend Zustand store.
   * Providers should use this instead of accessing window.localStorage directly.
   */
  debridToken?: string;
  /**
   * Which debrid service this token belongs to.
   */
  debridProvider?: 'real-debrid' | 'torbox' | 'alldebrid';
};

export type EmbedInput = {
  url: string;
};

export type EmbedScrapeContext = EmbedInput & ScrapeContext;

export type MovieScrapeContext = ScrapeContext & {
  media: MovieMedia;
};

export type ShowScrapeContext = ScrapeContext & {
  media: ShowMedia;
};
