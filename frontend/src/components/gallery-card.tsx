import { Skeleton } from '@/components/ui/skeleton'
import type { GalleryImage } from '@/types/gallery'

function GalleryCard({ image }: { image: GalleryImage }) {
  const metadata = image.image_metadata[0] ?? null
  const isProcessing =
    !metadata || metadata.ai_processing_status !== 'completed'
  const thumbnailUrl = image.thumbUrl ?? null

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
      {/* Thumbnail */}
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

      {/* Content */}
      <div className="space-y-2 p-3">
        <p className="truncate text-sm font-medium">
          {image.filename ?? 'Untitled'}
        </p>

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
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
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
    </div>
  )
}

export { GalleryCard }
