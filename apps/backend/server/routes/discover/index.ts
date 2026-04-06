import { TMDB } from 'tmdb-ts';
const tmdb = new TMDB(useRuntimeConfig().tmdbApiKey);
import { trakt } from '#imports';

export default defineCachedEventHandler(
  async event => {
    const popular = { movies: [], shows: [] };
    popular.movies.push(
      ...(data => (data.results.sort((a, b) => b.vote_average - a.vote_average), data.results))(
        await tmdb.movies.popular()
      )
    ); // Sorts by vote average
    popular.shows.push(
      ...(data => (data.results.sort((a, b) => b.vote_average - a.vote_average), data.results))(
        await tmdb.tvShows.popular()
      )
    ); // Sorts by vote average

    const genres = {
      movies: await tmdb.genres.movies(),
      shows: await tmdb.genres.tvShows(),
    };
    const topRated = {
      movies: await tmdb.movies.topRated(),
      shows: await tmdb.tvShows.topRated(),
    };
    const nowPlaying = {
      movies: (await tmdb.movies.nowPlaying()).results.sort(
        (a, b) => b.vote_average - a.vote_average
      ),
      shows: (await tmdb.tvShows.onTheAir()).results.sort(
        (a, b) => b.vote_average - a.vote_average
      ),
    };
    let lists = [];

    const internalLists = {
      trending: trakt ? await trakt.lists.trending().catch(() => []) : [],
      popular: trakt ? await trakt.lists.popular().catch(() => []) : [],
    };

    for (let list = 0; list < internalLists.trending.length; list++) {
      const listData = internalLists.trending[list];
      if (!listData || !listData.list || !listData.list.ids) continue;
      const items = trakt ? await trakt.lists.items({
        id: listData.list.ids.trakt,
        type: 'all',
      }).catch(() => []) : [];
      lists.push({
        name: listData.list.name,
        likes: listData.like_count,
        items: [],
      });
      for (let item = 0; item < items.length; item++) {
        switch (true) {
          case !!items[item].movie?.ids?.tmdb:
            lists[list].items.push({
              type: 'movie',
              name: items[item].movie.title,
              id: items[item].movie.ids.tmdb,
              year: items[item].movie.year,
            });
            break;
          case !!items[item].show?.ids?.tmdb:
            lists[list].items.push({
              type: 'show',
              name: items[item].show.title,
              id: items[item].show.ids.tmdb,
              year: items[item].show.year,
            });
            break;
        }
      }
    }

    for (let list = 0; list < internalLists.popular.length; list++) {
      const listData = internalLists.popular[list];
      if (!listData || !listData.list || !listData.list.ids) continue;
      const items = trakt ? await trakt.lists.items({
        id: listData.list.ids.trakt,
        type: 'all',
      }).catch(() => []) : [];
      lists.push({
        name: listData.list.name,
        likes: listData.like_count,
        items: [],
      });
      for (let item = 0; item < items.length; item++) {
        switch (true) {
          case !!items[item].movie?.ids?.tmdb:
            lists[lists.length - 1].items.push({
              type: 'movie',
              name: items[item].movie.title,
              id: items[item].movie.ids.tmdb,
              year: items[item].movie.year,
            });
            break;
          case !!items[item].show?.ids?.tmdb:
            lists[lists.length - 1].items.push({
              type: 'show',
              name: items[item].show.title,
              id: items[item].show.ids.tmdb,
              year: items[item].show.year,
            });
            break;
        }
      }
    }
    const trending = trakt ? await trakt.movies.popular().catch(() => []) : [];

    // most watched films
    const mostWatched = trakt ? await trakt.movies.watched().catch(() => []) : [];
    // takes the highest grossing box office film in the last weekend
    const lastWeekend = trakt ? await trakt.movies.boxoffice().catch(() => []) : [];

    return {
      mostWatched,
      lastWeekend,
      trending,
      popular,
      topRated,
      nowPlaying,
      genres,
      traktLists: lists,
    };
  },
  {
    maxAge: process.env.NODE_ENV === 'production' ? 60 * 60 : 0, // 1 hour for prod, no cache for dev.
  }
);
