import type { ColorSearchMatch, SimilarImageMatch } from '@/lib/api'
import { GALLERY_BUCKET, THUMBNAIL_URL_TTL_SECONDS } from '@/lib/gallery-constants'
import { getSignedUrlCached } from '@/lib/signed-url-cache'
import type { GalleryImage, ImageMetadataRow } from '@/types/gallery'

type GallerySearchMatch = Pick<
  SimilarImageMatch | ColorSearchMatch,
  | 'image_id'
  | 'filename'
  | 'original_path'
  | 'thumbnail_path'
  | 'tags'
  | 'colors'
  | 'description'
>

export async function createSignedThumbnailUrl(
  thumbnailPath: string | null
): Promise<string | null> {
  if (!thumbnailPath) return null

  return getSignedUrlCached({
    bucket: GALLERY_BUCKET,
    path: thumbnailPath,
    expiresIn: THUMBNAIL_URL_TTL_SECONDS,
  })
}

export function toSyntheticMetadataRow(match: GallerySearchMatch, userId: string): ImageMetadataRow {
  // Dev note: similarity endpoint returns denormalized metadata, so we synthesize a row for card rendering.
  return {
    id: -match.image_id,
    image_id: match.image_id,
    user_id: userId,
    ai_processing_status: 'completed',
    tags: match.tags,
    description: match.description,
    colors: match.colors,
    error_message: null,
    created_at: null,
  }
}

export async function toGalleryImage(
  match: GallerySearchMatch,
  userId: string,
  existingThumbUrl?: string | null
): Promise<GalleryImage> {
  const thumbUrl = existingThumbUrl ?? (await createSignedThumbnailUrl(match.thumbnail_path))
  return {
    id: match.image_id,
    user_id: userId,
    filename: match.filename,
    original_path: match.original_path,
    thumbnail_path: match.thumbnail_path,
    uploaded_at: null,
    image_metadata: [toSyntheticMetadataRow(match, userId)],
    thumbUrl,
  }
}

export function setImageStatusInList(
  list: GalleryImage[],
  imageId: number,
  status: 'processing' | 'failed'
): GalleryImage[] {
  return list.map((item) => {
    if (item.id !== imageId || item.image_metadata.length === 0) return item
    const [currentMeta, ...restMeta] = item.image_metadata
    return {
      ...item,
      image_metadata: [
        {
          ...currentMeta,
          ai_processing_status: status,
          error_message: status === 'processing' ? null : currentMeta.error_message,
        },
        ...restMeta,
      ],
    }
  })
}
