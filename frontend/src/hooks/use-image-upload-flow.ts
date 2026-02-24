import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/client'
import type { GalleryImage } from '@/types/gallery'

type UseImageUploadFlowOptions = {
  successes: string[]
  uploadedPaths: Record<string, string>
  userId: string
  addImage: (image: GalleryImage) => void
  resetUpload: () => void
}

export function useImageUploadFlow({
  successes,
  uploadedPaths,
  userId,
  addImage,
  resetUpload,
}: UseImageUploadFlowOptions) {
  const processedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const newSuccesses = successes.filter(
      (name) => !processedRef.current.has(name)
    )
    if (newSuccesses.length === 0) return

    newSuccesses.forEach((name) => processedRef.current.add(name))

    ;(async () => {
      await Promise.all(
        newSuccesses.map(async (filename) => {
          const storagePath = uploadedPaths[filename]
          if (!storagePath) {
            console.error(`No storage path found for "${filename}"`)
            return
          }

          // 1. Insert row into images table (filename for display, UUID path for storage)
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

          // 2. Add to gallery grid immediately (skeleton state)
          addImage({ ...data, image_metadata: [] })

          // 3. TODO: Call FastAPI backend to process image (thumbnail + AI analysis)
          // When the backend is ready, uncomment the line below:
          // await processImage(data.id, userId)
          console.log(
            `[API stub] Would call POST /api/process-image { image_id: ${data.id}, user_id: "${userId}" }`
          )
        })
      )

      // Reset dropzone state so the same files can be uploaded again
      processedRef.current.clear()
      resetUpload()
    })()
  }, [successes, uploadedPaths, userId, addImage, resetUpload])
}
