import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { findImagesByColor, type ColorSearchResponse } from '@/lib/api'
import { setImageStatusInList, toGalleryImage } from '@/lib/gallery-image-utils'
import type { GalleryImage } from '@/types/gallery'

const FILTER_PAGE_LIMIT = 20

export type ColorFilterState = {
  queryColor: ColorSearchResponse['query_color']
  matchThreshold: ColorSearchResponse['match_threshold']
  images: GalleryImage[]
  page: number
  limit: number
  totalCount: number
  totalPages: number
}

type UseColorFilterArgs = {
  userId: string | undefined
  filteredPage: number
  existingThumbUrlByImageId: Map<number, string | null>
}

type UseColorFilterReturn = {
  colorFilter: ColorFilterState | null
  isColorFilterLoading: boolean
  colorLoadingHex: string | null
  handleFilterByColor: (colorHex: string) => void
  clearColorFilter: () => void
  updateImageStatus: (imageId: number, status: 'processing' | 'failed') => void
}

export function useColorFilter({
  userId,
  filteredPage,
  existingThumbUrlByImageId,
}: UseColorFilterArgs): UseColorFilterReturn {
  const [colorFilter, setColorFilter] = useState<ColorFilterState | null>(null)
  const [isColorFilterLoading, setColorFilterLoading] = useState(false)
  const [colorLoadingHex, setColorLoadingHex] = useState<string | null>(null)
  const [activeColorHex, setActiveColorHex] = useState<string | null>(null)
  const colorRequestIdRef = useRef(0)

  const fetchColorPage = useCallback(
    async (colorHex: string, page: number) => {
      if (!userId) return

      const normalizedColor = colorHex.toUpperCase()
      const requestId = colorRequestIdRef.current + 1
      colorRequestIdRef.current = requestId

      setColorLoadingHex(normalizedColor)
      setColorFilterLoading(true)

      try {
        const response = await findImagesByColor(normalizedColor, {
          page,
          limit: colorFilter?.limit ?? FILTER_PAGE_LIMIT,
        })
        const mappedImages = await Promise.all(
          response.matches.map((match) =>
            toGalleryImage(match, userId, existingThumbUrlByImageId.get(match.image_id))
          )
        )

        if (colorRequestIdRef.current !== requestId) return
        setColorFilter({
          queryColor: response.query_color,
          matchThreshold: response.match_threshold,
          images: mappedImages,
          page: response.page,
          limit: response.limit,
          totalCount: response.total_count,
          totalPages: response.total_pages,
        })
      } catch {
        if (colorRequestIdRef.current !== requestId) return
        toast.error('Failed to filter images by color. Please try again.')
      } finally {
        if (colorRequestIdRef.current === requestId) {
          setColorFilterLoading(false)
          setColorLoadingHex(null)
        }
      }
    },
    [colorFilter?.limit, existingThumbUrlByImageId, userId]
  )

  const handleFilterByColor = useCallback(
    (colorHex: string) => {
      const normalizedColor = colorHex.toUpperCase()
      setActiveColorHex(normalizedColor)
      void fetchColorPage(normalizedColor, 1)
    },
    [fetchColorPage]
  )

  useEffect(() => {
    if (!activeColorHex || !colorFilter) return
    if (colorFilter.queryColor !== activeColorHex) return
    if (colorFilter.page === filteredPage) return
    void fetchColorPage(activeColorHex, filteredPage)
  }, [activeColorHex, colorFilter, fetchColorPage, filteredPage])

  const clearColorFilter = useCallback(() => {
    colorRequestIdRef.current += 1
    setActiveColorHex(null)
    setColorFilterLoading(false)
    setColorLoadingHex(null)
    setColorFilter(null)
  }, [])

  const updateImageStatus = useCallback((imageId: number, status: 'processing' | 'failed') => {
    setColorFilter((prev) =>
      prev ? { ...prev, images: setImageStatusInList(prev.images, imageId, status) } : prev
    )
  }, [])

  return useMemo(
    () => ({
      colorFilter,
      isColorFilterLoading,
      colorLoadingHex,
      handleFilterByColor,
      clearColorFilter,
      updateImageStatus,
    }),
    [
      clearColorFilter,
      colorFilter,
      colorLoadingHex,
      handleFilterByColor,
      isColorFilterLoading,
      updateImageStatus,
    ]
  )
}
