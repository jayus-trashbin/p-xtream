import { z } from 'zod';

// ─── Primitive Types ─────────────────────────────────────────────────────────

export type MediaType = 'movie' | 'show';

export interface Media {
  id: string;
  tmdbId: number;
  type: MediaType;
  title: string;
  year?: number;
  poster?: string;
}

export interface Episode {
  season: number;
  episode: number;
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const MediaTypeSchema = z.enum(['movie', 'show']);

export const MediaSchema = z.object({
  id: z.string(),
  tmdbId: z.number().int().positive(),
  type: MediaTypeSchema,
  title: z.string().min(1),
  year: z.number().int().optional(),
  poster: z.string().url().optional(),
});

export const EpisodeSchema = z.object({
  season: z.number().int().positive(),
  episode: z.number().int().positive(),
});
