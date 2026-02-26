import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { findSimilarImages, type SimilarImagesResponse } from '@/lib/api'
import { setImageStatusInList, toGalleryImage } from '@/lib/gallery-image-utils'
import type { GalleryImage } from '@/types/gallery'

const FILTER_PAGE_LIMIT = 20

export type SimilarFilterState = {
  query: SimilarImagesResponse['query']
  images: GalleryImage[]
  page: number
  limit: number
  totalCount: number
  totalPages: number
}

type UseSimilarFilterArgs = {
  userId: string | undefined
  filteredPage: number
  existingThumbUrlByImageId: Map<number, string | null>
}

type UseSimilarFilterReturn = {
  similarFilter: SimilarFilterState | null
  similarLoadingImageId: number | null
  handleFindSimilar: (image: GalleryImage) => void
  clearSimilarFilter: () => void
  updateImageStatus: (imageId: number, status: 'processing' | 'failed') => void
}

export function useSimilarFilter({
  userId,
  filteredPage,
  existingThumbUrlByImageId,
}: UseSimilarFilterArgs): UseSimilarFilterReturn {
  const [similarFilter, setSimilarFilter] = useState<SimilarFilterState | null>(null)
  const [similarLoadingImageId, setSimilarLoadingImageId] = useState<number | null>(null)
  const [activeQueryImageId, setActiveQueryImageId] = useState<number | null>(null)
  const similarRequestIdRef = useRef(0)

  const fetchSimilarPage = useCallback(
    async (queryImageId: number, page: number, loadingImageId?: number | null) => {
      if (!userId) return

      const requestId = similarRequestIdRef.current + 1
      similarRequestIdRef.current = requestId

      if (typeof loadingImageId === 'number') {
        setSimilarLoadingImageId(loadingImageId)
      }

      try {
        const response = await findSimilarImages(queryImageId, {
          page,
          limit: similarFilter?.limit ?? FILTER_PAGE_LIMIT,
        })
        const mappedImages = await Promise.all(
          response.matches.map((match) =>
            toGalleryImage(match, userId, existingThumbUrlByImageId.get(match.image_id))
          )
        )

        if (similarRequestIdRef.current !== requestId) return
        setSimilarFilter({
          query: response.query,
          images: mappedImages,
          page: response.page,
          limit: response.limit,
          totalCount: response.total_count,
          totalPages: response.total_pages,
        })
      } catch {
        if (similarRequestIdRef.current !== requestId) return
        toast.error('Failed to find similar images. Please try again.')
      } finally {
        if (
          similarRequestIdRef.current === requestId &&
          typeof loadingImageId === 'number'
        ) {
          setSimilarLoadingImageId(null)
        }
      }
    },
    [existingThumbUrlByImageId, similarFilter?.limit, userId]
  )

  const handleFindSimilar = useCallback(
    (image: GalleryImage) => {
      setActiveQueryImageId(image.id)
      void fetchSimilarPage(image.id, 1, image.id)
    },
    [fetchSimilarPage]
  )

  useEffect(() => {
    if (activeQueryImageId === null || similarFilter === null) return
    if (similarFilter.query.image_id !== activeQueryImageId) return
    if (similarFilter.page === filteredPage) return
    void fetchSimilarPage(activeQueryImageId, filteredPage)
  }, [activeQueryImageId, fetchSimilarPage, filteredPage, similarFilter])

  const clearSimilarFilter = useCallback(() => {
    similarRequestIdRef.current += 1
    setSimilarLoadingImageId(null)
    setActiveQueryImageId(null)
    setSimilarFilter(null)
  }, [])

  const updateImageStatus = useCallback((imageId: number, status: 'processing' | 'failed') => {
    setSimilarFilter((prev) =>
      prev ? { ...prev, images: setImageStatusInList(prev.images, imageId, status) } : prev
    )
  }, [])

  return useMemo(
    () => ({
      similarFilter,
      similarLoadingImageId,
      handleFindSimilar,
      clearSimilarFilter,
      updateImageStatus,
    }),
    [
      clearSimilarFilter,
      handleFindSimilar,
      similarFilter,
      similarLoadingImageId,
      updateImageStatus,
    ]
  )
}
