import { useCallback, useState } from 'react'
import { Upload } from 'lucide-react'

import { useAuth } from '@/auth/use-auth'
import { GalleryCard } from '@/components/gallery-card'
import { GalleryUploadPanel } from '@/components/gallery-upload-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { supabase } from '@/lib/client'
import { processImage } from '@/lib/api'

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
  const [isUploadPanelOpen, setUploadPanelOpen] = useState(false)

  const { images, loading, page, setPage, totalPages, addImage } =
    useGalleryImages(userId)

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

      if (error) {
        console.error('Failed to insert image row:', error)
        return
      }

      addImage({ ...data, image_metadata: [] })
      void processImage(data.id).catch((processError) => {
        console.error('Failed to process image:', processError)
      })

    },
    [userId, addImage]
  )

  const uploadProps = useSupabaseUpload({
    bucketName: 'gallery',
    path: `${userId}/originals`,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxFiles: 10,
    maxFileSize: 10 * 1024 * 1024,
    upsert: true,
    onFileUploaded: handleFileUploaded,
  })

  const { setFiles, setSuccesses, setErrors } = uploadProps

  const resetUpload = useCallback(() => {
    setFiles([])
    setSuccesses([])
    setErrors([])
  }, [setFiles, setSuccesses, setErrors])

  const queuedFileCount = uploadProps.files.length

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Gallery</h1>
          <p className="text-sm text-muted-foreground">
            Upload, review, and search your AI-tagged images.
          </p>
        </div>

        <Button onClick={() => setUploadPanelOpen(true)} className="gap-2">
          <Upload className="size-4" />
          Upload images
          {queuedFileCount > 0 && <Badge variant="secondary">{queuedFileCount}</Badge>}
        </Button>
      </div>

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
          No images yet. Use Upload images to get started.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {images.map((image) => (
            <GalleryCard key={image.id} image={image} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
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
