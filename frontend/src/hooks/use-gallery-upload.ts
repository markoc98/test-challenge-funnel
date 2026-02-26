import { useCallback } from 'react'
import { toast } from 'sonner'

import { useSupabaseUpload } from '@/hooks/use-supabase-upload'
import { processImage } from '@/lib/api'
import { supabase } from '@/lib/client'
import type { GalleryImage } from '@/types/gallery'

type UseGalleryUploadArgs = {
  userId: string | undefined
  bucketName: string
  addImage: (image: GalleryImage) => void
}

export function useGalleryUpload({ userId, bucketName, addImage }: UseGalleryUploadArgs) {
  const handleFileUploaded = useCallback(
    async (filename: string, storagePath: string) => {
      if (!userId) {
        throw new Error('User must be authenticated to upload images.')
      }

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

      if (error || !data) {
        toast.error('Failed to save uploaded image. Please retry.')
        await supabase.storage.from(bucketName).remove([storagePath])
        throw new Error(error?.message ?? 'Failed to create image record')
      }

      addImage({ ...data, image_metadata: [] })
      void processImage(data.id).catch(() => {
        toast.error('Image uploaded, but AI processing could not start.')
      })
    },
    [addImage, bucketName, userId]
  )

  return useSupabaseUpload({
    bucketName,
    path: `${userId ?? ''}/originals`,
    allowedMimeTypes: ['image/jpeg', 'image/png'],
    maxFiles: 10,
    maxFileSize: 10 * 1024 * 1024,
    upsert: true,
    onFileUploaded: handleFileUploaded,
  })
}
