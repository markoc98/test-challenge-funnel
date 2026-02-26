import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

type GalleryPaginationProps = {
  isDefaultGalleryView: boolean
  activePage: number
  activeTotalPages: number
  setPage: (page: number) => void
  setFilteredPage: (page: number) => void
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

export function GalleryPagination({
  isDefaultGalleryView,
  activePage,
  activeTotalPages,
  setPage,
  setFilteredPage,
}: GalleryPaginationProps) {
  if (activeTotalPages <= 1) return null

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            onClick={() =>
              isDefaultGalleryView
                ? setPage(Math.max(1, activePage - 1))
                : setFilteredPage(Math.max(1, activePage - 1))
            }
            className={activePage <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
          />
        </PaginationItem>

        {getPageNumbers(activePage, activeTotalPages).map((p, i) =>
          p === 'ellipsis' ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink
                isActive={p === activePage}
                onClick={() => (isDefaultGalleryView ? setPage(p) : setFilteredPage(p))}
                className="cursor-pointer"
              >
                {p}
              </PaginationLink>
            </PaginationItem>
          )
        )}

        <PaginationItem>
          <PaginationNext
            onClick={() =>
              isDefaultGalleryView
                ? setPage(Math.min(activeTotalPages, activePage + 1))
                : setFilteredPage(Math.min(activeTotalPages, activePage + 1))
            }
            className={
              activePage >= activeTotalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
