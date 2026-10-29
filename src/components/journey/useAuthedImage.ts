import { useEffect, useState } from 'react';
import { Platform, type ImageSourcePropType } from 'react-native';

export interface AuthedSource {
  uri: string;
  headers?: Record<string, string>;
}

/**
 * An image behind the bearer token (a punch photo). On the phone, React Native's Image sends the headers itself. A browser's
 * <img> cannot send them, so there (the preview build only) the image is fetched with them and shown from an object URL.
 * `source` is null until it can be shown; `failed` is true when it could not be loaded.
 */
export function useAuthedImage(src: AuthedSource | null): { source: ImageSourcePropType | null; failed: boolean } {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const web = Platform.OS === 'web';
  const uri = src?.uri ?? null;
  const auth = src?.headers?.Authorization;

  useEffect(() => {
    if (!web || !uri) return;
    let live = true;
    let made: string | null = null;
    setFailed(false);
    fetch(uri, { headers: auth ? { Authorization: auth } : undefined })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        made = URL.createObjectURL(blob);
        if (live) setBlobUrl(made);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [web, uri, auth]);

  if (!src) return { source: null, failed: false };
  if (!web) return { source: { uri: src.uri, headers: src.headers }, failed };
  return { source: blobUrl ? { uri: blobUrl } : null, failed };
}
