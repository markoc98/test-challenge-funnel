import { Loader2, Search, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type GallerySearchBarProps = {
  searchInput: string
  searchQuery: string
  isSearchLoading: boolean
  onSearchInputChange: (value: string) => void
  onClearSearch: () => void
}

export function GallerySearchBar({
  searchInput,
  searchQuery,
  isSearchLoading,
  onSearchInputChange,
  onClearSearch,
}: GallerySearchBarProps) {
  const isTextSearchActive = searchQuery.length > 0

  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">
        Upload, review, and search your AI-tagged images.
      </p>
      <div className="flex w-full max-w-md items-center gap-2 pt-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => onSearchInputChange(event.target.value)}
            placeholder="Search description and tags"
            className="pl-8"
            aria-label="Search images by description and tags"
          />
        </div>
        {searchInput.trim().length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onClearSearch}>
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
            onClick={onClearSearch}
            aria-label="Clear text search"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}
    </div>
  )
}
