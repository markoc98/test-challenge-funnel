import { useEffect, useState } from 'react'

import { supabase } from '@/lib/client'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import type { GalleryImage } from '@/types/gallery'

const ORIGINAL_URL_TTL_SECONDS = 60 * 60
const GALLERY_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'gallery'

function GalleryCard({ image }: { image: GalleryImage }) {
  const [isDetailOpen, setDetailOpen] = useState(false)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [isOriginalLoading, setOriginalLoading] = useState(false)

  const metadata = image.image_metadata[0] ?? null
  const isProcessing = !metadata || metadata.ai_processing_status !== 'completed'
  const thumbnailUrl = image.thumbUrl ?? null

  useEffect(() => {
    if (!isDetailOpen || !image.original_path) {
      return
    }

    const originalPath = image.original_path
    let isCancelled = false
    setOriginalLoading(true)

    void (async () => {
      const { data, error } = await supabase.storage
        .from(GALLERY_BUCKET)
        .createSignedUrl(originalPath, ORIGINAL_URL_TTL_SECONDS)

      if (isCancelled) return

      if (error) {
        console.error('Failed to sign original image URL:', error)
        setOriginalUrl(null)
      } else {
        setOriginalUrl(data?.signedUrl ?? null)
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
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {metadata.colors && metadata.colors.length > 0 && (
                  <div className="flex gap-1">
                    {metadata.colors.map((color) => (
                      <span
                        key={color}
                        className="h-4 w-4 rounded-full border"
                        style={{ backgroundColor: color }}
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
                    <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {tag}
                    </span>
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
                    <span
                      key={color}
                      className="h-6 w-6 rounded-full border"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-sm">No color palette available yet.</p>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { GalleryCard }
