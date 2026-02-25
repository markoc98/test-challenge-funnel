import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/client'
import type { GalleryImage, ImageMetadataRow, ImageRow } from '@/types/gallery'

const PAGE_SIZE = 20
const THUMBNAIL_URL_TTL_SECONDS = 60 * 60
const GALLERY_BUCKET = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET ?? 'gallery'

async function createSignedThumbnailUrl(
  thumbnailPath: string | null
): Promise<string | null> {
  if (!thumbnailPath) return null

  const { data, error } = await supabase.storage
    .from(GALLERY_BUCKET)
    .createSignedUrl(thumbnailPath, THUMBNAIL_URL_TTL_SECONDS)

  if (error) {
    console.error('Failed to sign thumbnail URL:', error)
    return null
  }

  return data?.signedUrl ?? null
}

async function attachThumbnailUrls(images: GalleryImage[]): Promise<GalleryImage[]> {
  return Promise.all(
    images.map(async (image) => ({
      ...image,
      thumbUrl: await createSignedThumbnailUrl(image.thumbnail_path),
    }))
  )
}

export function useGalleryImages(userId: string | undefined) {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const fetchImages = useCallback(async () => {
    if (!userId) return

    setLoading(true)

    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, count, error } = await supabase
      .from('images')
      .select('*, image_metadata(*)', { count: 'exact' })
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('Failed to fetch images:', error)
    } else {
      const fetchedImages = (data as GalleryImage[]) ?? []
      const imagesWithSignedThumbs = await attachThumbnailUrls(fetchedImages)
      setImages(imagesWithSignedThumbs)
      setTotalCount(count ?? 0)
    }

    setLoading(false)
  }, [userId, page])

  // Initial fetch + refetch on page change
  useEffect(() => {
    fetchImages()
  }, [fetchImages])

  // Realtime subscriptions
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('gallery-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'images',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updatedImage = payload.new as ImageRow

          void (async () => {
            const thumbUrl = await createSignedThumbnailUrl(updatedImage.thumbnail_path)

            setImages((prev) =>
              prev.map((img) =>
                img.id === updatedImage.id
                  ? {
                    ...img,
                    ...updatedImage,
                    image_metadata: img.image_metadata,
                    thumbUrl,
                  }
                  : img
              )
            )
          })()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'image_metadata',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newMeta = payload.new as ImageMetadataRow
          setImages((prev) =>
            prev.map((img) =>
              img.id === newMeta.image_id
                ? { ...img, image_metadata: [...img.image_metadata, newMeta] }
                : img
            )
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'image_metadata',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const updatedMeta = payload.new as ImageMetadataRow
          setImages((prev) =>
            prev.map((img) => {
              const hasMeta = img.image_metadata.some((m) => m.id === updatedMeta.id)
              if (!hasMeta) return img
              return {
                ...img,
                image_metadata: img.image_metadata.map((m) =>
                  m.id === updatedMeta.id ? updatedMeta : m
                ),
              }
            })
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  // Optimistic add: prepend a new image to the current page
  const addImage = useCallback(
    (image: GalleryImage) => {
      if (page === 1) {
        setImages((prev) => [image, ...prev].slice(0, PAGE_SIZE))
      }
      setTotalCount((prev) => prev + 1)
    },
    [page]
  )

  return {
    images,
    loading,
    page,
    setPage,
    totalPages,
    totalCount,
    addImage,
    refetch: fetchImages,
  }
}
