import { Loader2, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ColorFilterState } from '@/hooks/use-color-filter'
import type { SimilarFilterState } from '@/hooks/use-similar-filter'

type GalleryFilterBadgesProps = {
  similarFilter: SimilarFilterState | null
  similarQueryLabel: string | null
  similarQueryThumbUrl: string | null
  onClearSimilar: () => void
  colorFilter: ColorFilterState | null
  isColorFilterLoading: boolean
  colorLoadingHex: string | null
  onClearColor: () => void
}

export function GalleryFilterBadges({
  similarFilter,
  similarQueryLabel,
  similarQueryThumbUrl,
  onClearSimilar,
  colorFilter,
  isColorFilterLoading,
  colorLoadingHex,
  onClearColor,
}: GalleryFilterBadgesProps) {
  return (
    <>
      {similarFilter && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge variant="outline" className="gap-1.5">
            {similarQueryThumbUrl && (
              <img
                src={similarQueryThumbUrl}
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
            onClick={onClearSimilar}
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
            onClick={onClearColor}
            aria-label="Clear color filter"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}
    </>
  )
}
