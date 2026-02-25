import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search, Upload, X } from 'lucide-react'

import { useAuth } from '@/auth/use-auth'
import { GalleryCard } from '@/components/gallery-card'
import { GalleryUploadPanel } from '@/components/gallery-upload-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { useGalleryImages } from '@/hooks/use-gallery-images'
import { useSupabaseUpload } from '@/hooks/use-supabase-upload'
import {
  findImagesByColor,
  findSimilarImages,
  processImage,
  type ColorSearchMatch,
  type ColorSearchResponse,
  type SimilarImageMatch,
  type SimilarImagesResponse,
} from '@/lib/api'
import { supabase } from '@/lib/client'
import { getSignedUrlCached } from '@/lib/signed-url-cache'
import type { GalleryImage, ImageMetadataRow } from '@/types/gallery'

const GALLERY_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'gallery'
const THUMBNAIL_URL_TTL_SECONDS = 60 * 60
const SEARCH_DEBOUNCE_MS = 300

type SimilarFilterState = {
  query: SimilarImagesResponse['query']
  images: GalleryImage[]
}

type ColorFilterState = {
  queryColor: ColorSearchResponse['query_color']
  matchThreshold: ColorSearchResponse['match_threshold']
  images: GalleryImage[]
}

type GallerySearchMatch = Pick<
  SimilarImageMatch | ColorSearchMatch,
  | 'image_id'
  | 'filename'
  | 'original_path'
  | 'thumbnail_path'
  | 'tags'
  | 'colors'
  | 'description'
>

type ImageMetadataSearchRow = {
  image_id: number | null
}

async function createSignedThumbnailUrl(
  thumbnailPath: string | null
): Promise<string | null> {
  if (!thumbnailPath) return null

  const signedUrl = await getSignedUrlCached({
    bucket: GALLERY_BUCKET,
    path: thumbnailPath,
    expiresIn: THUMBNAIL_URL_TTL_SECONDS,
  })
  if (!signedUrl) {
    console.error('Failed to sign thumbnail URL.')
  }
  return signedUrl
}

function toSyntheticMetadataRow(match: GallerySearchMatch, userId: string): ImageMetadataRow {
  // Dev note: similarity endpoint returns denormalized metadata, so we synthesize a row for card rendering.
  return {
    id: -match.image_id,
    image_id: match.image_id,
    user_id: userId,
    ai_processing_status: 'completed',
    tags: match.tags,
    description: match.description,
    colors: match.colors,
    error_message: null,
    created_at: null,
  }
}

async function toGalleryImage(
  match: GallerySearchMatch,
  userId: string,
  existingThumbUrl?: string | null
): Promise<GalleryImage> {
  const thumbUrl =
    existingThumbUrl ?? (await createSignedThumbnailUrl(match.thumbnail_path))
  return {
    id: match.image_id,
    user_id: userId,
    filename: match.filename,
    original_path: match.original_path,
    thumbnail_path: match.thumbnail_path,
    uploaded_at: null,
    image_metadata: [toSyntheticMetadataRow(match, userId)],
    thumbUrl,
  }
}

function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | 'ellipsis')[] = [1]

  if (current > 3) pages.push('ellipsis')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('ellipsis')

  pages.push(total)
  return pages
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

export function GalleryPage() {
  const { user } = useAuth()
  const userId = user!.id
  const [isUploadPanelOpen, setUploadPanelOpen] = useState(false)
  const [similarFilter, setSimilarFilter] = useState<SimilarFilterState | null>(null)
  const [similarLoadingImageId, setSimilarLoadingImageId] = useState<number | null>(null)
  const [colorFilter, setColorFilter] = useState<ColorFilterState | null>(null)
  const [isColorFilterLoading, setColorFilterLoading] = useState(false)
  const [colorLoadingHex, setColorLoadingHex] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GalleryImage[]>([])
  const [isSearchLoading, setSearchLoading] = useState(false)
  const searchRequestIdRef = useRef(0)

  const { images, loading, page, setPage, totalPages, addImage } =
    useGalleryImages(userId)
  const isTextSearchActive = searchQuery.length > 0
  const isSimilarFilterActive = similarFilter !== null
  const isColorFilterActive = colorFilter !== null

  const existingThumbUrlByImageId = useMemo(
    () => new Map(images.map((item) => [item.id, item.thumbUrl ?? null])),
    [images]
  )
  const displayedImages = useMemo(() => {
    if (similarFilter) return similarFilter.images
    if (colorFilter) return colorFilter.images
    if (isTextSearchActive) return searchResults
    return images
  }, [colorFilter, images, isTextSearchActive, searchResults, similarFilter])

  const similarQueryImage = useMemo(() => {
    if (!similarFilter) return null
    return images.find((item) => item.id === similarFilter.query.image_id) ?? null
  }, [images, similarFilter])
  const similarQueryLabel = similarQueryImage?.filename ?? (
    similarFilter ? `image #${similarFilter.query.image_id}` : null
  )

  const clearTextSearch = useCallback(() => {
    searchRequestIdRef.current += 1
    setSearchInput('')
    setSearchQuery('')
    setSearchResults([])
    setSearchLoading(false)
  }, [])

  useEffect(() => {
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

      setSimilarFilter(null)
      setColorFilter(null)
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
            console.error('Failed to run text search:', descriptionResult.error, tagsResult.error)
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
            console.error('Failed to fetch text search matches:', matchedImagesError)
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
        } catch (error) {
          if (searchRequestIdRef.current !== requestId) return
          console.error('Failed to search images:', error)
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
  }, [existingThumbUrlByImageId, searchInput, userId])

  const handleFileUploaded = useCallback(
    async (filename: string, storagePath: string) => {
      const { data, error } = await supabase
        .from('images')
        .insert({
          user_id: userId,
          filename,
          original_path: storagePath,
          uploaded_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error || !data) {
        console.error('Failed to insert image row:', error)
        const { error: cleanupError } = await supabase.storage
          .from(GALLERY_BUCKET)
          .remove([storagePath])
        if (cleanupError) {
          console.error('Failed to cleanup orphaned storage object:', cleanupError)
        }
        throw new Error(error?.message ?? 'Failed to create image record')
      }

      addImage({ ...data, image_metadata: [] })
      void processImage(data.id).catch((processError) => {
        console.error('Failed to process image:', processError)
      })

    },
    [userId, addImage]
  )

  const handleFindSimilar = useCallback(
    async (image: GalleryImage) => {
      setSimilarLoadingImageId(image.id)
      try {
        clearTextSearch()
        setColorFilter(null)
        const response = await findSimilarImages(image.id)
        const mappedImages = await Promise.all(
          response.matches.map((match) =>
            toGalleryImage(match, userId, existingThumbUrlByImageId.get(match.image_id))
          )
        )
        setSimilarFilter({
          query: response.query,
          images: mappedImages,
        })
      } catch (error) {
        console.error('Failed to fetch similar images:', error)
      } finally {
        setSimilarLoadingImageId(null)
      }
    },
    [clearTextSearch, existingThumbUrlByImageId, userId]
  )

  const handleFilterByColor = useCallback(
    async (colorHex: string) => {
      const normalizedColor = colorHex.toUpperCase()
      setColorLoadingHex(normalizedColor)
      setColorFilterLoading(true)
      try {
        clearTextSearch()
        setSimilarFilter(null)
        const response = await findImagesByColor(normalizedColor)
        const mappedImages = await Promise.all(
          response.matches.map((match) =>
            toGalleryImage(match, userId, existingThumbUrlByImageId.get(match.image_id))
          )
        )
        setColorFilter({
          queryColor: response.query_color,
          matchThreshold: response.match_threshold,
          images: mappedImages,
        })
      } catch (error) {
        console.error('Failed to filter images by color:', error)
      } finally {
        setColorFilterLoading(false)
        setColorLoadingHex(null)
      }
    },
    [clearTextSearch, existingThumbUrlByImageId, userId]
  )

  const clearSimilarFilter = useCallback(() => {
    setSimilarFilter(null)
  }, [])

  const clearColorFilter = useCallback(() => {
    setColorFilter(null)
  }, [])

  const handleTagClick = useCallback((tag: string) => {
    setSimilarFilter(null)
    setColorFilter(null)
    setSearchInput(tag)
  }, [])

  const uploadProps = useSupabaseUpload({
    bucketName: GALLERY_BUCKET,
    path: `${userId}/originals`,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxFiles: 10,
    maxFileSize: 10 * 1024 * 1024,
    upsert: true,
    onFileUploaded: handleFileUploaded,
  })

  const resetUpload = uploadProps.reset

  const queuedFileCount = uploadProps.files.length

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Gallery</h1>
          <p className="text-sm text-muted-foreground">
            Upload, review, and search your AI-tagged images.
          </p>
          <div className="flex w-full max-w-md items-center gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search description and tags"
                className="pl-8"
                aria-label="Search images by description and tags"
              />
            </div>
            {searchInput.trim().length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearTextSearch}
              >
                Clear
              </Button>
            )}
          </div>
          {isTextSearchActive && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="gap-1.5">
                {isSearchLoading ? <Loader2 className="size-3.5 animate-spin" /> : null}
                <span>Text matches for "{searchQuery}"</span>
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={clearTextSearch}
                aria-label="Clear text search"
              >
                <X className="size-3" />
              </Button>
            </div>
          )}
          {similarFilter && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="gap-1.5">
                {similarQueryImage?.thumbUrl && (
                  <img
                    src={similarQueryImage.thumbUrl}
                    alt=""
                    className="size-6 rounded-sm object-cover"
                    loading="lazy"
                  />
                )}
                <span>Similar matches for {similarQueryLabel}</span>
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={clearSimilarFilter}
                aria-label="Clear similar filter"
              >
                <X className="size-3" />
              </Button>
            </div>
          )}
          {colorFilter && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="outline" className="gap-1.5">
                {(isColorFilterLoading || colorLoadingHex) ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                <span
                  className="size-3 rounded-full border"
                  style={{ backgroundColor: colorFilter.queryColor }}
                  aria-hidden
                />
                <span>
                  Color matches for {colorFilter.queryColor} ({'>='}{' '}
                  {colorFilter.matchThreshold.toFixed(2)})
                </span>
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={clearColorFilter}
                aria-label="Clear color filter"
              >
                <X className="size-3" />
              </Button>
            </div>
          )}
        </div>

        <Button onClick={() => setUploadPanelOpen(true)} className="gap-2">
          <Upload className="size-4" />
          Upload images
          {queuedFileCount > 0 && <Badge variant="secondary">{queuedFileCount}</Badge>}
        </Button>
      </div>

      {((loading &&
        !isSimilarFilterActive &&
        !isColorFilterActive &&
        !isTextSearchActive &&
        images.length === 0) ||
        (isTextSearchActive && isSearchLoading && displayedImages.length === 0) ||
        (isColorFilterActive && isColorFilterLoading && displayedImages.length === 0)) ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-lg border bg-card">
              <Skeleton className="aspect-square" />
              <div className="space-y-1.5 p-3">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : displayedImages.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          {isSimilarFilterActive
            ? 'No similar matches above threshold. Clear the filter to view the full gallery.'
            : isColorFilterActive
              ? `No color matches for ${colorFilter?.queryColor ?? 'the selected color'}.`
            : isTextSearchActive
              ? `No text matches for "${searchQuery}".`
            : 'No images yet. Use Upload images to get started.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {displayedImages.map((image) => (
            <GalleryCard
              key={image.id}
              image={image}
              onFindSimilar={handleFindSimilar}
              onTagClick={handleTagClick}
              isFindingSimilar={similarLoadingImageId === image.id}
              onFilterByColor={handleFilterByColor}
              activeColorHex={colorFilter?.queryColor ?? null}
              isFilteringColorHex={colorLoadingHex}
            />
          ))}
        </div>
      )}

      {!isSimilarFilterActive && !isColorFilterActive && !isTextSearchActive && totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(Math.max(1, page - 1))}
                className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>

            {getPageNumbers(page, totalPages).map((p, i) =>
              p === 'ellipsis' ? (
                <PaginationItem key={`ellipsis-${i}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => setPage(p)}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              )
            )}

            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                className={page >= totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <GalleryUploadPanel
        open={isUploadPanelOpen}
        onOpenChange={setUploadPanelOpen}
        onReset={resetUpload}
        uploadProps={uploadProps}
      />
    </section>
  )
}
