import { supabase } from '@/lib/client'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export async function processImage(imageId: number) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token
  if (!token) throw new Error("Not authenticated");

  const response = await fetch(`${API_BASE_URL}/api/process-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ image_id: imageId }),
  })

  if (!response.ok) throw new Error(await response.text())
  return response.json()
}
