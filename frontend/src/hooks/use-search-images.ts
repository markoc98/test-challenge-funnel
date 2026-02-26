import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { supabase } from '@/lib/client'
import { createSignedThumbnailUrl, setImageStatusInList } from '@/lib/gallery-image-utils'
import type { GalleryImage } from '@/types/gallery'

const SEARCH_DEBOUNCE_MS = 300

type ImageMetadataSearchRow = {
  image_id: number | null
}

type UseSearchImagesArgs = {
  userId: string | undefined
  existingThumbUrlByImageId: Map<number, string | null>
}

type UseSearchImagesReturn = {
  searchInput: string
  setSearchInput: (value: string) => void
  searchQuery: string
  searchResults: GalleryImage[]
  isSearchLoading: boolean
  clearSearch: () => void
  updateImageStatus: (imageId: number, status: 'processing' | 'failed') => void
}

function normalizeSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function toTagSearchTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
    )
  )
}

export function useSearchImages({
  userId,
  existingThumbUrlByImageId,
}: UseSearchImagesArgs): UseSearchImagesReturn {
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GalleryImage[]>([])
  const [isSearchLoading, setSearchLoading] = useState(false)
  const searchRequestIdRef = useRef(0)
  const searchErrorToastAtRef = useRef(0)

  const clearSearch = useCallback(() => {
    searchRequestIdRef.current += 1
    setSearchInput('')
    setSearchQuery('')
    setSearchResults([])
    setSearchLoading(false)
  }, [])

  const notifySearchError = useCallback(() => {
    const now = Date.now()
    if (now - searchErrorToastAtRef.current < 2500) return
    searchErrorToastAtRef.current = now
    toast.error('Text search failed. Please try again.')
  }, [])

  const updateImageStatus = useCallback((imageId: number, status: 'processing' | 'failed') => {
    setSearchResults((prev) => setImageStatusInList(prev, imageId, status))
  }, [])

  useEffect(() => {
    if (!userId) {
      searchRequestIdRef.current += 1
      setSearchQuery('')
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    const normalizedQuery = normalizeSearchQuery(searchInput)

    if (!normalizedQuery) {
      searchRequestIdRef.current += 1
      setSearchQuery('')
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    const timeoutId = window.setTimeout(() => {
      const requestId = searchRequestIdRef.current + 1
      searchRequestIdRef.current = requestId

      setSearchQuery(normalizedQuery)
      setSearchLoading(true)

      void (async () => {
        try {
          const tagTerms = toTagSearchTerms(normalizedQuery)

          const [descriptionResult, tagsResult] = await Promise.all([
            supabase
              .from('image_metadata')
              .select('image_id')
              .eq('user_id', userId)
              .not('image_id', 'is', null)
              .textSearch('description', normalizedQuery, {
                type: 'websearch',
                config: 'english',
              }),
            supabase
              .from('image_metadata')
              .select('image_id')
              .eq('user_id', userId)
              .not('image_id', 'is', null)
              .overlaps('tags', tagTerms),
          ])

          if (searchRequestIdRef.current !== requestId) return

          if (descriptionResult.error || tagsResult.error) {
            notifySearchError()
            setSearchResults([])
            return
          }

          const imageIds = new Set<number>()
          const metadataRows = [
            ...((descriptionResult.data as ImageMetadataSearchRow[] | null) ?? []),
            ...((tagsResult.data as ImageMetadataSearchRow[] | null) ?? []),
          ]
          for (const row of metadataRows) {
            if (typeof row.image_id === 'number') imageIds.add(row.image_id)
          }

          if (imageIds.size === 0) {
            setSearchResults([])
            return
          }

          const { data: matchedImages, error: matchedImagesError } = await supabase
            .from('images')
            .select('*, image_metadata(*)')
            .eq('user_id', userId)
            .in('id', Array.from(imageIds))
            .order('uploaded_at', { ascending: false })

          if (searchRequestIdRef.current !== requestId) return

          if (matchedImagesError) {
            notifySearchError()
            setSearchResults([])
            return
          }

          const resultsWithSignedThumbs = await Promise.all(
            ((matchedImages as GalleryImage[] | null) ?? []).map(async (image) => ({
              ...image,
              thumbUrl:
                existingThumbUrlByImageId.get(image.id) ??
                (await createSignedThumbnailUrl(image.thumbnail_path)),
            }))
          )

          if (searchRequestIdRef.current !== requestId) return
          setSearchResults(resultsWithSignedThumbs)
        } catch {
          if (searchRequestIdRef.current !== requestId) return
          notifySearchError()
          setSearchResults([])
        } finally {
          if (searchRequestIdRef.current === requestId) {
            setSearchLoading(false)
          }
        }
      })()
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [existingThumbUrlByImageId, notifySearchError, searchInput, userId])

  return {
    searchInput,
    setSearchInput,
    searchQuery,
    searchResults,
    isSearchLoading,
    clearSearch,
    updateImageStatus,
  }
}
