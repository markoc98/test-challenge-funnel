import { supabase } from '@/lib/client'

type CacheEntry = {
  url: string
  expiresAt: number
}

type SignedUrlCacheParams = {
  bucket: string
  path: string
  expiresIn: number
  download?: boolean
}

const CACHE_SAFETY_WINDOW_MS = 30_000
const signedUrlCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<string | null>>()

function buildKey({ bucket, path, expiresIn, download = false }: SignedUrlCacheParams): string {
  return `${bucket}|${path}|${expiresIn}|${download ? '1' : '0'}`
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() < entry.expiresAt - CACHE_SAFETY_WINDOW_MS
}

export async function getSignedUrlCached(params: SignedUrlCacheParams): Promise<string | null> {
  const key = buildKey(params)
  const cached = signedUrlCache.get(key)
  if (cached && isFresh(cached)) {
    return cached.url
  }

  const pending = inFlight.get(key)
  if (pending) {
    return pending
  }

  const request = (async () => {
    const { data, error } = await supabase.storage
      .from(params.bucket)
      .createSignedUrl(params.path, params.expiresIn, { download: params.download ?? false })

    if (error || !data?.signedUrl) {
      return null
    }

    signedUrlCache.set(key, {
      url: data.signedUrl,
      expiresAt: Date.now() + params.expiresIn * 1000,
    })
    return data.signedUrl
  })().finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, request)
  return request
}
