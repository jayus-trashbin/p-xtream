import { z } from 'zod';
import { Media, Episode, MediaSchema, EpisodeSchema } from './media';

export interface WatchProgress {
  media: Media;
  episode?: Episode;
  /** Current position in seconds */
  progress: number;
  /** Total duration in seconds */
  duration: number;
  /** ISO 8601 timestamp */
  updatedAt: string;
}

export const ProgressSchema = z.object({
  tmdbId: z.number().int().positive(),
  type: z.enum(['movie', 'show']),
  progress: z.number().min(0),
  duration: z.number().positive(),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
});

export const WatchProgressSchema = z.object({
  media: MediaSchema,
  episode: EpisodeSchema.optional(),
  progress: z.number().min(0),
  duration: z.number().positive(),
  updatedAt: z.string().datetime(),
});

export type ProgressInput = z.infer<typeof ProgressSchema>;
export type WatchProgressData = z.infer<typeof WatchProgressSchema>;
