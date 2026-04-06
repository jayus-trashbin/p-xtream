import Trakt from 'trakt.tv';
const traktKeys = useRuntimeConfig().trakt;

let trakt: Trakt | null = null;

if (traktKeys?.clientId && traktKeys?.clientSecret) {
  const options = {
    client_id: traktKeys.clientId,
    client_secret: traktKeys.clientSecret,
  };
  trakt = new Trakt(options);
}

export default trakt;
