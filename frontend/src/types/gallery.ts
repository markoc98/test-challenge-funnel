import type { Database } from '../../database.types'

export type ImageRow = Database['public']['Tables']['images']['Row']
export type ImageMetadataRow = Database['public']['Tables']['image_metadata']['Row']

export type GalleryImage = ImageRow & {
  image_metadata: ImageMetadataRow[]
}
