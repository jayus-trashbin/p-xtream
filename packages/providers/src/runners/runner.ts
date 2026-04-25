import { FullScraperEvents, UpdateEvent } from '@/entrypoint/utils/events';
import { ScrapeMedia } from '@/entrypoint/utils/media';
import { FeatureMap, flagsAllowedInFeatures } from '@/entrypoint/utils/targets';
import { UseableFetcher } from '@/fetchers/types';
import { EmbedOutput, SourcererOutput } from '@/providers/base';
import { ProviderList } from '@/providers/get';
import { Stream } from '@/providers/streams';
import { ScrapeContext } from '@/utils/context';
import { isCircuitOpen, recordFailure, recordSuccess } from '@/utils/circuitBreaker';
import { NotFoundError } from '@/utils/errors';
import { reorderOnIdList } from '@/utils/list';
import { requiresProxy, setupProxy } from '@/utils/proxy';
import { isValidStream, validatePlayableStream } from '@/utils/valid';

export type RunOutput = {
  sourceId: string;
  embedId?: string;
  stream: Stream;
};

export type SourceRunOutput = {
  sourceId: string;
  stream: Stream[];
  embeds: [];
};

export type EmbedRunOutput = {
  embedId: string;
  stream: Stream[];
};

export type ProviderRunnerOptions = {
  fetcher: UseableFetcher;
  proxiedFetcher: UseableFetcher;
  features: FeatureMap;
  sourceOrder?: string[];
  embedOrder?: string[];
  events?: FullScraperEvents;
  media: ScrapeMedia;
  proxyStreams?: boolean; // temporary
  parallelTopN?: number; // race first N providers simultaneously, then fall back sequentially
};

async function runSingleSource(
  source: ProviderList['sources'][number],
  contextBase: ScrapeContext,
  embeds: ProviderList['embeds'],
  embedIds: string[],
  ops: ProviderRunnerOptions,
  updateLastId: (id: string) => void,
): Promise<RunOutput | null> {
  if (isCircuitOpen(source.id)) {
    ops.events?.update?.({
      id: source.id,
      percentage: 100,
      status: 'notfound',
      reason: 'Circuit open — provider temporarily disabled',
    });
    return null;
  }

  ops.events?.start?.(source.id);
  updateLastId(source.id);

  let output: SourcererOutput | null = null;
  try {
    if (ops.media.type === 'movie' && source.scrapeMovie)
      output = await source.scrapeMovie({ ...contextBase, media: ops.media });
    else if (ops.media.type === 'show' && source.scrapeShow)
      output = await source.scrapeShow({ ...contextBase, media: ops.media });

    if (output) {
      output.stream = (output.stream ?? [])
        .filter(isValidStream)
        .filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
      output.stream = output.stream.map((stream) =>
        requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream,
      );
    }
    if (!output || (!output.stream?.length && !output.embeds.length)) {
      throw new NotFoundError('No streams found');
    }
  } catch (error) {
    if (!(error instanceof NotFoundError)) recordFailure(source.id);
    ops.events?.update?.({
      id: source.id,
      percentage: 100,
      status: error instanceof NotFoundError ? 'notfound' : 'failure',
      reason: error instanceof NotFoundError ? (error as NotFoundError).message : undefined,
      error: error instanceof NotFoundError ? undefined : error,
    });
    return null;
  }

  if (!output) return null;

  // direct stream
  if (output.stream?.[0]) {
    try {
      const playableStream = await validatePlayableStream(output.stream[0], ops, source.id);
      if (!playableStream) throw new NotFoundError('No streams found');
      recordSuccess(source.id);
      return { sourceId: source.id, stream: playableStream };
    } catch (error) {
      if (!(error instanceof NotFoundError)) recordFailure(source.id);
      ops.events?.update?.({
        id: source.id,
        percentage: 100,
        status: error instanceof NotFoundError ? 'notfound' : 'failure',
        reason: error instanceof NotFoundError ? (error as NotFoundError).message : 'Stream validation failed',
        error: error instanceof NotFoundError ? undefined : error,
      });
    }
  }

  // embed scrapers
  const sortedEmbeds = output.embeds
    .filter((embed) => {
      const e = embeds.find((v) => v.id === embed.embedId);
      return e && !e.disabled;
    })
    .sort((a, b) => embedIds.indexOf(a.embedId) - embedIds.indexOf(b.embedId));

  if (sortedEmbeds.length > 0) {
    ops.events?.discoverEmbeds?.({
      embeds: sortedEmbeds.map((embed, i) => ({
        id: [source.id, i].join('-'),
        embedScraperId: embed.embedId,
      })),
      sourceId: source.id,
    });
  }

  for (const [ind, embed] of sortedEmbeds.entries()) {
    const scraper = embeds.find((v) => v.id === embed.embedId);
    if (!scraper) throw new Error('Invalid embed returned');

    const id = [source.id, ind].join('-');
    ops.events?.start?.(id);
    updateLastId(id);

    let embedOutput: EmbedOutput;
    try {
      embedOutput = await scraper.scrape({ ...contextBase, url: embed.url });
      embedOutput.stream = embedOutput.stream
        .filter(isValidStream)
        .filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
      embedOutput.stream = embedOutput.stream.map((stream) =>
        requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream,
      );
      if (embedOutput.stream.length === 0) throw new NotFoundError('No streams found');

      const playableStream = await validatePlayableStream(embedOutput.stream[0], ops, embed.embedId);
      if (!playableStream) throw new NotFoundError('No streams found');

      embedOutput.stream = [playableStream];
    } catch (error) {
      ops.events?.update?.({
        id,
        percentage: 100,
        status: error instanceof NotFoundError ? 'notfound' : 'failure',
        reason: error instanceof NotFoundError ? (error as NotFoundError).message : undefined,
        error: error instanceof NotFoundError ? undefined : error,
      });
      continue;
    }

    return {
      sourceId: source.id,
      embedId: scraper.id,
      stream: embedOutput.stream[0],
    };
  }

  return null;
}

export async function runAllProviders(list: ProviderList, ops: ProviderRunnerOptions): Promise<RunOutput | null> {
  const sources = reorderOnIdList(ops.sourceOrder ?? [], list.sources).filter((source) => {
    if (ops.media.type === 'movie') return !!source.scrapeMovie;
    if (ops.media.type === 'show') return !!source.scrapeShow;
    return false;
  });
  const embeds = reorderOnIdList(ops.embedOrder ?? [], list.embeds);
  const embedIds = embeds.map((embed) => embed.id);
  let lastId = '';

  const contextBase: ScrapeContext = {
    fetcher: ops.fetcher,
    proxiedFetcher: ops.proxiedFetcher,
    features: ops.features,
    progress(val) {
      ops.events?.update?.({
        id: lastId,
        percentage: val,
        status: 'pending',
      });
    },
  };

  ops.events?.init?.({
    sourceIds: sources.map((v) => v.id),
  });

  const parallelTopN = ops.parallelTopN ?? 0;
  let startIndex = 0;

  // --- Parallel batch: race top-N providers simultaneously ---
  if (parallelTopN > 1 && sources.length > 0) {
    const batch = sources.slice(0, parallelTopN);
    startIndex = batch.length;

    const raceResult = await Promise.race(
      batch.map((source) =>
        runSingleSource(source, contextBase, embeds, embedIds, ops, (id) => {
          lastId = id;
        }),
      ),
    );

    if (raceResult) return raceResult;
  }

  // --- Sequential fallback for remaining providers ---
  for (const source of sources.slice(startIndex)) {
    const result = await runSingleSource(source, contextBase, embeds, embedIds, ops, (id) => {
      lastId = id;
    });
    if (result) return result;
  }

  return null;
}

