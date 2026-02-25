import { type MouseEvent, useEffect, useState } from 'react'
import { Loader2, Search } from 'lucide-react'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getSignedUrlCached } from '@/lib/signed-url-cache'
import type { GalleryImage } from '@/types/gallery'

const ORIGINAL_URL_TTL_SECONDS = 60 * 60
const GALLERY_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'gallery'

type GalleryCardProps = {
  image: GalleryImage
  onFindSimilar?: (image: GalleryImage) => void
  onTagClick?: (tag: string) => void
  isFindingSimilar?: boolean
  onFilterByColor?: (colorHex: string) => void
  activeColorHex?: string | null
  isFilteringColorHex?: string | null
}

function GalleryCard({
  image,
  onFindSimilar,
  onTagClick,
  isFindingSimilar = false,
  onFilterByColor,
  activeColorHex = null,
  isFilteringColorHex = null,
}: GalleryCardProps) {
  const [isDetailOpen, setDetailOpen] = useState(false)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [isOriginalLoading, setOriginalLoading] = useState(false)

  const metadata = image.image_metadata[0] ?? null
  const isProcessing = !metadata || metadata.ai_processing_status !== 'completed'
  const canFindSimilar = Boolean(onFindSimilar && !isProcessing)
  const canFilterByColor = Boolean(onFilterByColor && !isProcessing)
  const normalizedActiveColor = activeColorHex?.toUpperCase() ?? null
  const thumbnailUrl = image.thumbUrl ?? null

  const handleColorFilterClick = (colorHex: string) => {
    if (!onFilterByColor) return
    setDetailOpen(false)
    onFilterByColor(colorHex)
  }

  const handlePreviewColorClick = (
    event: MouseEvent<HTMLSpanElement>,
    colorHex: string
  ) => {
    event.preventDefault()
    event.stopPropagation()
    handleColorFilterClick(colorHex)
  }

  const handleTagClick = (
    event: MouseEvent<HTMLButtonElement>,
    tag: string
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (!onTagClick) return
    setDetailOpen(false)
    onTagClick(tag)
  }

  useEffect(() => {
    if (!isDetailOpen || !image.original_path) {
      return
    }

    const originalPath = image.original_path
    let isCancelled = false
    setOriginalLoading(true)

    void (async () => {
      const signedUrl = await getSignedUrlCached({
        bucket: GALLERY_BUCKET,
        path: originalPath,
        expiresIn: ORIGINAL_URL_TTL_SECONDS,
      })

      if (isCancelled) return

      if (!signedUrl) {
        console.error('Failed to sign original image URL.')
        setOriginalUrl(null)
      } else {
        setOriginalUrl(signedUrl)
      }

      setOriginalLoading(false)
    })()

    return () => {
      isCancelled = true
    }
  }, [isDetailOpen, image.original_path])

  return (
    <Sheet open={isDetailOpen} onOpenChange={setDetailOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="w-full overflow-hidden rounded-lg border bg-card text-left shadow-sm transition hover:ring-2 hover:ring-primary/30"
          aria-label={`Open details for ${image.filename ?? 'image'}`}
        >
          <div className="aspect-square bg-muted">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={image.filename ?? ''}
                className="h-full w-full object-cover"
              />
            ) : (
              <Skeleton className="h-full w-full rounded-none" />
            )}
          </div>

          <div className="space-y-2 p-3">
            <p className="truncate text-sm font-medium">{image.filename ?? 'Untitled'}</p>

            {isProcessing ? (
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : (
              <>
                {metadata.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {metadata.description}
                  </p>
                )}

                {metadata.tags && metadata.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {metadata.tags.slice(0, 4).map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        className={`rounded-full bg-muted px-2 py-0.5 text-xs transition-all duration-150 ${
                          onTagClick
                            ? 'cursor-pointer hover:bg-accent hover:text-accent-foreground hover:ring-1 hover:ring-primary/70'
                            : ''
                        }`}
                        title={onTagClick ? `Search by tag "${tag}"` : tag}
                        onClick={(event) => handleTagClick(event, tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {metadata.colors && metadata.colors.length > 0 && (
                  <div className="flex gap-1">
                    {metadata.colors.map((color) => (
                      <span
                        key={color}
                        className={`h-4 w-4 rounded-full border transition-transform duration-150 hover:scale-110 hover:ring-2 hover:ring-primary/70 hover:ring-offset-1 hover:ring-offset-background ${
                          canFilterByColor ? 'cursor-pointer' : ''
                        }`}
                        style={{ backgroundColor: color }}
                        title={canFilterByColor ? `Filter by ${color}` : color}
                        onClick={(event) => handlePreviewColorClick(event, color)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle>{image.filename ?? 'Untitled'}</SheetTitle>
          <SheetDescription>Original image and AI analysis details</SheetDescription>
        </SheetHeader>

        <div className="grid h-[calc(100dvh-7rem)] gap-4 p-4 pt-0 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex items-center justify-center overflow-hidden rounded-lg border bg-muted p-2">
            {isOriginalLoading ? (
              <Skeleton className="h-full w-full" />
            ) : originalUrl ? (
              <img
                src={originalUrl}
                alt={image.filename ?? 'Original image'}
                className="h-full w-full object-contain"
              />
            ) : (
              <p className="text-sm text-muted-foreground">Original image unavailable.</p>
            )}
          </div>

          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Similar search</p>
              <div className="mt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canFindSimilar || isFindingSimilar}
                  onClick={() => onFindSimilar?.(image)}
                  className="w-full"
                >
                  {isFindingSimilar ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Finding matches...
                    </>
                  ) : (
                    <>
                      <Search className="size-4" />
                      Find similar
                    </>
                  )}
                </Button>
              </div>
              {!canFindSimilar && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Available after processing is complete.
                </p>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-medium">
                {metadata?.ai_processing_status ?? 'processing'}
              </p>
            </div>

            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="mt-1 text-sm">
                {metadata?.description ?? 'No description available yet.'}
              </p>
            </div>

            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Tags</p>
              {metadata?.tags && metadata.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {metadata.tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`rounded-full bg-muted px-2 py-0.5 text-xs transition-all duration-150 ${
                        onTagClick
                          ? 'cursor-pointer hover:bg-accent hover:text-accent-foreground hover:ring-1 hover:ring-primary/70'
                          : ''
                      }`}
                      title={onTagClick ? `Search by tag "${tag}"` : tag}
                      onClick={(event) => handleTagClick(event, tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm">No tags available yet.</p>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Dominant colors</p>
              {metadata?.colors && metadata.colors.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {metadata.colors.map((color) => (
                    <button
                      type="button"
                      key={color}
                      className={`h-6 w-6 cursor-pointer rounded-full border shadow-sm transition-transform duration-150 hover:scale-110 hover:ring-2 hover:ring-primary/70 hover:ring-offset-2 hover:ring-offset-background focus-visible:scale-110 focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:ring-0 ${
                        normalizedActiveColor === color.toUpperCase()
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                          : ''
                      }`}
                      style={{ backgroundColor: color }}
                      title={
                        canFilterByColor
                          ? `Filter by ${color}`
                          : color
                      }
                      aria-label={`Filter images by color ${color}`}
                      disabled={!canFilterByColor || Boolean(isFilteringColorHex)}
                      onClick={() => handleColorFilterClick(color)}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm">No color palette available yet.</p>
              )}
              {canFilterByColor && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Click a color to filter similar-colored images.
                </p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { GalleryCard }
