const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export async function processImage(imageId: number, userId: string) {
  // TODO: Call FastAPI backend to process the image (thumbnail generation + AI analysis)
  console.log(`[API stub] POST ${API_BASE_URL}/api/process-image`, {
    image_id: imageId,
    user_id: userId,
  })
}
