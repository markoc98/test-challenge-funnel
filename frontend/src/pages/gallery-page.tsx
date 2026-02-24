import { useCallback } from 'react'
import { useAuth } from '@/auth/use-auth'
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from '@/components/dropzone'
import { GalleryCard } from '@/components/gallery-card'
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
import { useImageUploadFlow } from '@/hooks/use-image-upload-flow'
import { useSupabaseUpload } from '@/hooks/use-supabase-upload'

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

export function GalleryPage() {
  const { user } = useAuth()
  const userId = user!.id

  const uploadProps = useSupabaseUpload({
    bucketName: 'gallery',
    path: `${userId}/originals`,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxFiles: 10,
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    upsert: true,
  })

  const { images, loading, page, setPage, totalPages, addImage } =
    useGalleryImages(userId)

  const resetUpload = useCallback(() => {
    uploadProps.setFiles([])
    uploadProps.setSuccesses([])
  }, [uploadProps.setFiles, uploadProps.setSuccesses])

  useImageUploadFlow({
    successes: uploadProps.successes,
    uploadedPaths: uploadProps.uploadedPaths,
    userId,
    addImage,
    resetUpload,
  })

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Gallery</h1>

      {/* Upload zone */}
      <Dropzone {...uploadProps}>
        <DropzoneEmptyState />
        <DropzoneContent />
      </Dropzone>

      {/* Image grid */}
      {loading && images.length === 0 ? (
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
      ) : images.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No images yet. Drop some files above to get started.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image) => (
            <GalleryCard key={image.id} image={image} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(Math.max(1, page - 1))}
                className={
                  page <= 1
                    ? 'pointer-events-none opacity-50'
                    : 'cursor-pointer'
                }
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
                className={
                  page >= totalPages
                    ? 'pointer-events-none opacity-50'
                    : 'cursor-pointer'
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </section>
  )
}
