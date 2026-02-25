import { supabase } from '@/lib/client'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export type SimilarImageScoreBreakdown = {
  cosine: number
  rare_tag_boost: number
  rare_tags: string[]
}

export type SimilarImageMatch = {
  image_id: number
  filename: string | null
  original_path: string | null
  thumbnail_path: string | null
  score: number
  is_match: boolean
  tags: string[]
  colors: string[]
  description: string
  score_breakdown: SimilarImageScoreBreakdown
}

export type SimilarImageQuery = {
  image_id: number
  tags: string[]
  colors: string[]
  description: string
}

export type SimilarImagesResponse = {
  query: SimilarImageQuery
  match_threshold: number
  matches: SimilarImageMatch[]
}

export type ColorSearchMatch = {
  image_id: number
  filename: string | null
  original_path: string | null
  thumbnail_path: string | null
  score: number
  tags: string[]
  colors: string[]
  description: string
}

export type ColorSearchResponse = {
  query_color: string
  match_threshold: number
  matches: ColorSearchMatch[]
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')
  return token
}

async function refreshAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.refreshSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Not authenticated')
  return token
}

async function postJsonWithToken(path: string, body: unknown, token: string): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

async function postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
  let token = await getAccessToken()
  let response = await postJsonWithToken(path, body, token)

  if (response.status === 401) {
    token = await refreshAccessToken()
    response = await postJsonWithToken(path, body, token)
  }

  if (!response.ok) throw new Error(await response.text())
  return (await response.json()) as TResponse
}

export async function processImage(imageId: number) {
  return postJson<{ message: string }>('/api/process-image', { image_id: imageId })
}

export async function findSimilarImages(imageId: number) {
  return postJson<SimilarImagesResponse>('/api/images/similar', { image_id: imageId })
}

export async function findImagesByColor(colorHex: string, threshold?: number) {
  return postJson<ColorSearchResponse>('/api/images/by-color', {
    color_hex: colorHex,
    threshold,
  })
}
