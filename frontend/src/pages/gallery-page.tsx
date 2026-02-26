import { useCallback, useEffect, useMemo, useState } from 'react'
import { Upload } from 'lucide-react'
import { useAuth } from '@/auth/use-auth'
import { GalleryFilterBadges } from '@/components/gallery-filter-badges'
import { GalleryGrid, type GalleryViewState } from '@/components/gallery-grid'
import { GalleryPagination } from '@/components/gallery-pagination'
import { GallerySearchBar } from '@/components/gallery-search-bar'
import { GalleryUploadPanel } from '@/components/gallery-upload-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useColorFilter } from '@/hooks/use-color-filter'
import { useGalleryImages } from '@/hooks/use-gallery-images'
import { useGalleryUpload } from '@/hooks/use-gallery-upload'
import { useSearchImages } from '@/hooks/use-search-images'
import { useSimilarFilter } from '@/hooks/use-similar-filter'
import { processImage } from '@/lib/api'
import { GALLERY_BUCKET } from '@/lib/gallery-constants'
import type { GalleryImage } from '@/types/gallery'

const SEARCH_RESULTS_PAGE_SIZE = 20

export function GalleryPage() {
  const { user } = useAuth()
  const userId = user?.id
  const [isUploadPanelOpen, setUploadPanelOpen] = useState(false)
  const [filteredPage, setFilteredPage] = useState(1)
  const { images, loading, page, setPage, totalPages, addImage, setImageProcessingStatus } = useGalleryImages(userId)
  const existingThumbUrlByImageId = useMemo(
    () => new Map(images.map((item) => [item.id, item.thumbUrl ?? null])),
    [images]
  )
  const search = useSearchImages({ userId, existingThumbUrlByImageId })
  const similar = useSimilarFilter({ userId, filteredPage, existingThumbUrlByImageId })
  const color = useColorFilter({ userId, filteredPage, existingThumbUrlByImageId })
  useEffect(() => {
    if (!search.searchQuery) return
    similar.clearSimilarFilter()
    color.clearColorFilter()
    setFilteredPage(1)
  }, [color.clearColorFilter, search.searchQuery, similar.clearSimilarFilter])
  const isTextSearchActive = search.searchQuery.length > 0
  const isSimilarFilterActive = similar.similarFilter !== null
  const isColorFilterActive = color.colorFilter !== null
  const isDefaultGalleryView = !isSimilarFilterActive && !isColorFilterActive && !isTextSearchActive
  const textSearchTotalPages = useMemo(
    () => Math.max(1, Math.ceil(search.searchResults.length / SEARCH_RESULTS_PAGE_SIZE)),
    [search.searchResults.length]
  )
  const displayedImages = useMemo(() => {
    if (isDefaultGalleryView) return images
    if (similar.similarFilter) return similar.similarFilter.images
    if (color.colorFilter) return color.colorFilter.images
    const from = (filteredPage - 1) * SEARCH_RESULTS_PAGE_SIZE
    const to = from + SEARCH_RESULTS_PAGE_SIZE
    return search.searchResults.slice(from, to)
  }, [
    color.colorFilter,
    filteredPage,
    images,
    isDefaultGalleryView,
    search.searchResults,
    similar.similarFilter,
  ])
  const activePage = isDefaultGalleryView ? page : filteredPage
  const activeTotalPages = isDefaultGalleryView
    ? totalPages
    : similar.similarFilter?.totalPages ??
    color.colorFilter?.totalPages ??
    textSearchTotalPages
  useEffect(() => {
    if (isDefaultGalleryView || filteredPage <= activeTotalPages) return
    setFilteredPage(activeTotalPages)
  }, [activeTotalPages, filteredPage, isDefaultGalleryView])
  const similarQueryImage = useMemo(() => {
    if (!similar.similarFilter) return null
    return images.find((item) => item.id === similar.similarFilter!.query.image_id) ?? null
  }, [images, similar.similarFilter])
  const similarQueryLabel = similarQueryImage?.filename ?? (
    similar.similarFilter ? `image #${similar.similarFilter.query.image_id}` : null
  )
  const clearSearch = useCallback(() => {
    search.clearSearch()
    setFilteredPage(1)
  }, [search])
  const clearSimilarFilter = useCallback(() => {
    similar.clearSimilarFilter()
    setFilteredPage(1)
  }, [similar])
  const clearColorFilter = useCallback(() => {
    color.clearColorFilter()
    setFilteredPage(1)
  }, [color])
  const handleFindSimilar = useCallback(
    (image: GalleryImage) => {
      search.clearSearch()
      color.clearColorFilter()
      setFilteredPage(1)
      similar.handleFindSimilar(image)
    },
    [color, search, similar]
  )
  const handleFilterByColor = useCallback(
    (colorHex: string) => {
      search.clearSearch()
      similar.clearSimilarFilter()
      setFilteredPage(1)
      color.handleFilterByColor(colorHex)
    },
    [color, search, similar]
  )
  const handleRetryProcessing = useCallback(
    async (image: GalleryImage) => {
      setImageProcessingStatus(image.id, 'processing')
      search.updateImageStatus(image.id, 'processing')
      similar.updateImageStatus(image.id, 'processing')
      color.updateImageStatus(image.id, 'processing')
      try {
        await processImage(image.id)
      } catch {
        setImageProcessingStatus(image.id, 'failed')
        search.updateImageStatus(image.id, 'failed')
        similar.updateImageStatus(image.id, 'failed')
        color.updateImageStatus(image.id, 'failed')
      }
    },
    [color, search, setImageProcessingStatus, similar]
  )
  const handleTagClick = useCallback(
    (tag: string) => {
      similar.clearSimilarFilter()
      color.clearColorFilter()
      setFilteredPage(1)
      search.setSearchInput(tag)
    },
    [color, search, similar]
  )
  const uploadProps = useGalleryUpload({ userId, bucketName: GALLERY_BUCKET, addImage })
  // GalleryPage is rendered inside a protected route, but keep this guard for runtime/type safety.
  if (!user) return null
  const isInitialGalleryLoading = loading && isDefaultGalleryView && images.length === 0
  const isTextLoading = isTextSearchActive && search.isSearchLoading && displayedImages.length === 0
  const isColorLoading = isColorFilterActive && color.isColorFilterLoading && displayedImages.length === 0
  const galleryViewState: GalleryViewState =
    isInitialGalleryLoading || isTextLoading || isColorLoading
      ? 'loading'
      : displayedImages.length === 0
        ? 'empty'
        : 'results'
  const emptyMessage = isSimilarFilterActive
    ? 'No similar matches above threshold. Clear the filter to view the full gallery.'
    : isColorFilterActive
      ? `No color matches for ${color.colorFilter?.queryColor ?? 'the selected color'}.`
      : isTextSearchActive
        ? `No text matches for "${search.searchQuery}".`
        : 'No images yet. Use Upload images to get started.'
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <GallerySearchBar searchInput={search.searchInput} searchQuery={search.searchQuery} isSearchLoading={search.isSearchLoading} onSearchInputChange={search.setSearchInput} onClearSearch={clearSearch} />
          <GalleryFilterBadges
            similarFilter={similar.similarFilter}
            similarQueryLabel={similarQueryLabel}
            similarQueryThumbUrl={similarQueryImage?.thumbUrl ?? null}
            onClearSimilar={clearSimilarFilter}
            colorFilter={color.colorFilter}
            isColorFilterLoading={color.isColorFilterLoading}
            colorLoadingHex={color.colorLoadingHex}
            onClearColor={clearColorFilter}
          />
        </div>
        <Button onClick={() => setUploadPanelOpen(true)} className="gap-2">
          <Upload className="size-4" />
          Upload images
          {uploadProps.files.length > 0 && <Badge variant="secondary">{uploadProps.files.length}</Badge>}
        </Button>
      </div>
      <GalleryGrid
        galleryViewState={galleryViewState}
        emptyMessage={emptyMessage}
        displayedImages={displayedImages}
        onFindSimilar={handleFindSimilar}
        onRetryProcessing={handleRetryProcessing}
        onTagClick={handleTagClick}
        similarLoadingImageId={similar.similarLoadingImageId}
        onFilterByColor={handleFilterByColor}
        activeColorHex={color.colorFilter?.queryColor ?? null}
        isFilteringColorHex={color.colorLoadingHex}
      />
      <GalleryPagination isDefaultGalleryView={isDefaultGalleryView} activePage={activePage} activeTotalPages={activeTotalPages} setPage={setPage} setFilteredPage={setFilteredPage} />
      <GalleryUploadPanel
        open={isUploadPanelOpen}
        onOpenChange={setUploadPanelOpen}
        onReset={uploadProps.reset}
        uploadProps={uploadProps}
      />
    </section>
  )
}
