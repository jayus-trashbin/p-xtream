import { z } from 'zod';
import { Media, MediaSchema } from './media';

export interface Bookmark {
  media: Media;
  /** ISO 8601 timestamp */
  createdAt: string;
}

export const BookmarkSchema = z.object({
  tmdbId: z.number().int().positive(),
  type: z.enum(['movie', 'show']),
});

export const BookmarkFullSchema = z.object({
  media: MediaSchema,
  createdAt: z.string().datetime(),
});

export type BookmarkInput = z.infer<typeof BookmarkSchema>;
export type BookmarkData = z.infer<typeof BookmarkFullSchema>;
