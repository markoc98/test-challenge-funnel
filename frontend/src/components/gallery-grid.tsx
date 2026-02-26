import { GalleryCard } from '@/components/gallery-card'
import { Skeleton } from '@/components/ui/skeleton'
import type { GalleryImage } from '@/types/gallery'

export type GalleryViewState = 'loading' | 'empty' | 'results'

type GalleryGridProps = {
  galleryViewState: GalleryViewState
  emptyMessage: string
  displayedImages: GalleryImage[]
  onFindSimilar: (image: GalleryImage) => void
  onRetryProcessing: (image: GalleryImage) => void
  onTagClick: (tag: string) => void
  similarLoadingImageId: number | null
  onFilterByColor: (colorHex: string) => void
  activeColorHex: string | null
  isFilteringColorHex: string | null
}

export function GalleryGrid({
  galleryViewState,
  emptyMessage,
  displayedImages,
  onFindSimilar,
  onRetryProcessing,
  onTagClick,
  similarLoadingImageId,
  onFilterByColor,
  activeColorHex,
  isFilteringColorHex,
}: GalleryGridProps) {
  if (galleryViewState === 'loading') {
    return (
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
    )
  }

  if (galleryViewState === 'empty') {
    return <p className="py-12 text-center text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {displayedImages.map((image) => (
        <GalleryCard
          key={image.id}
          image={image}
          onFindSimilar={onFindSimilar}
          onRetryProcessing={onRetryProcessing}
          onTagClick={onTagClick}
          isFindingSimilar={similarLoadingImageId === image.id}
          onFilterByColor={onFilterByColor}
          activeColorHex={activeColorHex}
          isFilteringColorHex={isFilteringColorHex}
        />
      ))}
    </div>
  )
}
