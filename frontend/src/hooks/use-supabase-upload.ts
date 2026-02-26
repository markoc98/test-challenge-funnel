import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone, type FileError, type FileRejection } from 'react-dropzone'
import { Upload, type PreviousUpload } from 'tus-js-client'

import { supabase } from '@/lib/client'

interface FileWithPreview extends File {
  preview?: string
  errors: readonly FileError[]
}

type UploadFileStatus = 'queued' | 'uploading' | 'finalizing' | 'success' | 'error'

type FileUploadProgress = {
  status: UploadFileStatus
  progress: number
  uploadedBytes: number
  totalBytes: number
}

type UseSupabaseUploadOptions = {
  /**
   * Name of bucket to upload files to in your Supabase project
   */
  bucketName: string
  /**
   * Folder to upload files to in the specified bucket within your Supabase project.
   *
   * Defaults to uploading files to the root of the bucket
   *
   * e.g If specified path is `test`, your file will be uploaded as `test/file_name`
   */
  path?: string
  /**
   * Allowed MIME types for each file upload (e.g `image/png`, `text/html`, etc). Wildcards are also supported (e.g `image/*`).
   *
   * Defaults to allowing uploading of all MIME types.
   */
  allowedMimeTypes?: string[]
  /**
   * Maximum upload size of each file allowed in bytes. (e.g 1000 bytes = 1 KB)
   */
  maxFileSize?: number
  /**
   * Maximum number of files allowed per upload.
   */
  maxFiles?: number
  /**
   * The number of seconds the asset is cached in the browser and in the Supabase CDN.
   *
   * This is set in the Cache-Control: max-age=<seconds> header. Defaults to 3600 seconds.
   */
  cacheControl?: number
  /**
   * When set to true, the file is overwritten if it exists.
   *
   * When set to false, an error is thrown if the object already exists. Defaults to `false`
   */
  upsert?: boolean
  /**
   * Called per file after successful upload to storage.
   * Throw an error to mark the file as failed.
   */
  onFileUploaded?: (filename: string, storagePath: string) => Promise<void> | void
}

type UseSupabaseUploadReturn = ReturnType<typeof useSupabaseUpload>

function toStorageEndpoint(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (url.hostname.endsWith('.supabase.co')) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/i, '.storage.supabase.co')
  }
  url.pathname = '/storage/v1/upload/resumable'
  url.search = ''
  url.hash = ''
  return url.toString()
}

function getTusErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Failed to upload file'
  }

  const originalResponse = (
    error as Error & {
      originalResponse?: {
        getBody?: () => string
      }
    }
  ).originalResponse
  const body = originalResponse?.getBody?.()
  if (!body) {
    return error.message || 'Failed to upload file'
  }

  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string }
    return parsed.error ?? parsed.message ?? error.message
  } catch {
    return body
  }
}

const useSupabaseUpload = (options: UseSupabaseUploadOptions) => {
  const {
    bucketName,
    path,
    allowedMimeTypes = [],
    maxFileSize = Number.POSITIVE_INFINITY,
    maxFiles = 1,
    cacheControl = 3600,
    upsert = false,
    onFileUploaded,
  } = options

  const [files, setFiles] = useState<FileWithPreview[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<{ name: string; message: string }[]>([])
  const [successes, setSuccesses] = useState<string[]>([])
  const [progressByFile, setProgressByFile] = useState<Record<string, FileUploadProgress>>({})
  const filesRef = useRef<FileWithPreview[]>([])

  const revokePreview = useCallback((file: FileWithPreview) => {
    if (file.preview) {
      URL.revokeObjectURL(file.preview)
    }
  }, [])

  const isSuccess = useMemo(() => {
    return errors.length === 0 && successes.length > 0 && successes.length === files.length
  }, [errors.length, successes.length, files.length])

  useEffect(() => {
    filesRef.current = files
  }, [files])

  useEffect(() => {
    return () => {
      filesRef.current.forEach(revokePreview)
    }
  }, [revokePreview])

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      setFiles((prev) => {
        const validFiles = acceptedFiles
          .filter((file) => !prev.find((x) => x.name === file.name))
          .map((file) => {
            ;(file as FileWithPreview).preview = URL.createObjectURL(file)
            ;(file as FileWithPreview).errors = []
            return file as FileWithPreview
          })

        const invalidFiles = fileRejections.map(({ file, errors }) => {
          ;(file as FileWithPreview).preview = URL.createObjectURL(file)
          ;(file as FileWithPreview).errors = errors
          return file as FileWithPreview
        })

        const nextFiles = [...prev, ...validFiles, ...invalidFiles]
        const addedFiles = [...validFiles, ...invalidFiles]
        if (addedFiles.length > 0) {
          setProgressByFile((prevProgress) => {
            const nextProgress = { ...prevProgress }
            for (const file of addedFiles) {
              const key = file.name
              nextProgress[key] = {
                status: file.errors.length > 0 ? 'error' : 'queued',
                progress: 0,
                uploadedBytes: 0,
                totalBytes: file.size,
              }
            }
            return nextProgress
          })
        }

        return nextFiles
      })
    },
    [setFiles, setProgressByFile]
  )

  const dropzoneProps = useDropzone({
    onDrop,
    noClick: true,
    accept: allowedMimeTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxFileSize,
    maxFiles,
    multiple: maxFiles !== 1,
  })

  const uploadFileWithProgress = useCallback(
    async (
      file: File,
      fullPath: string,
      onProgress: (uploadedBytes: number, totalBytes: number) => void
    ) => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
      if (!supabaseUrl || !publishableKey) {
        throw new Error('Supabase URL or publishable key is not configured')
      }

      const { data, error } = await supabase.auth.getSession()
      if (error) throw error

      const accessToken = data.session?.access_token
      if (!accessToken) {
        throw new Error('Not authenticated')
      }

      const endpoint = toStorageEndpoint(supabaseUrl)
      await new Promise<void>((resolve, reject) => {
        const upload = new Upload(file, {
          endpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000],
          headers: {
            authorization: `Bearer ${accessToken}`,
            apikey: publishableKey,
            'x-upsert': upsert ? 'true' : 'false',
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName,
            objectName: fullPath,
            contentType: file.type || 'application/octet-stream',
            cacheControl: cacheControl.toString(),
          },
          chunkSize: 6 * 1024 * 1024,
          onError(error: unknown) {
            reject(new Error(getTusErrorMessage(error)))
          },
          onProgress(bytesUploaded: number, bytesTotal: number) {
            onProgress(bytesUploaded, bytesTotal)
          },
          onSuccess() {
            resolve()
          },
        })

        void upload
          .findPreviousUploads()
          .then((previousUploads: PreviousUpload[]) => {
            if (previousUploads.length > 0) {
              upload.resumeFromPreviousUpload(previousUploads[0])
            }
            upload.start()
          })
          .catch((error: unknown) => {
            reject(new Error(getTusErrorMessage(error)))
          })
      })
    },
    [bucketName, cacheControl, upsert]
  )

  const onUpload = useCallback(async () => {
    setLoading(true)

    const filesWithErrors = new Set(errors.map((x) => x.name))
    const successfulFiles = new Set(successes)
    const filesToUpload = files.filter(
      (file) =>
        file.errors.length === 0 &&
        (filesWithErrors.has(file.name) || !successfulFiles.has(file.name))
    )

    if (filesToUpload.length === 0) {
      setLoading(false)
      return
    }

    setProgressByFile((prev) => {
      const next = { ...prev }
      for (const file of filesToUpload) {
        const key = file.name
        next[key] = {
          status: 'uploading',
          progress: 0,
          uploadedBytes: 0,
          totalBytes: file.size,
        }
      }
      return next
    })

    const retryNames = new Set(filesToUpload.map((f) => f.name))
    setErrors((prev) => prev.filter((e) => !retryNames.has(e.name)))

    await Promise.all(
      filesToUpload.map(async (file) => {
        const extIndex = file.name.lastIndexOf('.')
        const ext = extIndex >= 0 ? file.name.slice(extIndex) : ''
        const storageName = `${crypto.randomUUID()}${ext}`
        const fullPath = path ? `${path}/${storageName}` : storageName

        try {
          await uploadFileWithProgress(file, fullPath, (uploadedBytes, totalBytes) => {
            const key = file.name
            const progress =
              totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0
            setProgressByFile((prev) => ({
              ...prev,
              [key]: {
                status: 'uploading',
                progress,
                uploadedBytes,
                totalBytes,
              },
            }))
          })
          const key = file.name
          setProgressByFile((prev) => ({
            ...prev,
            [key]: {
              status: 'finalizing',
              progress: 100,
              uploadedBytes: file.size,
              totalBytes: file.size,
            },
          }))

          await onFileUploaded?.(file.name, fullPath)

          setErrors((prev) => prev.filter((item) => item.name !== file.name))
          setSuccesses((prev) => (prev.includes(file.name) ? prev : [...prev, file.name]))
          setProgressByFile((prev) => ({
            ...prev,
            [key]: {
              status: 'success',
              progress: 100,
              uploadedBytes: file.size,
              totalBytes: file.size,
            },
          }))
        } catch (uploadError: unknown) {
          const key = file.name
          const message =
            uploadError instanceof Error ? uploadError.message : 'Failed to upload file'
          setErrors((prev) => [
            ...prev.filter((item) => item.name !== file.name),
            { name: file.name, message },
          ])
          setProgressByFile((prev) => ({
            ...prev,
            [key]: {
              status: 'error',
              progress: prev[key]?.progress ?? 0,
              uploadedBytes: prev[key]?.uploadedBytes ?? 0,
              totalBytes: file.size,
            },
          }))
        }
      })
    )

    setLoading(false)
  }, [
    errors,
    files,
    onFileUploaded,
    path,
    setErrors,
    setLoading,
    setProgressByFile,
    setSuccesses,
    successes,
    uploadFileWithProgress,
  ])

  const removeFile = useCallback(
    (fileName: string) => {
      setFiles((prev) => {
        const target = prev.find((file) => file.name === fileName)
        if (target) {
          revokePreview(target)
        }
        return prev.filter((file) => file.name !== fileName)
      })
      setProgressByFile((prev) => {
        const next = { ...prev }
        delete next[fileName]
        return next
      })
      setErrors((prev) => prev.filter((item) => item.name !== fileName))
      setSuccesses((prev) => prev.filter((name) => name !== fileName))
    },
    [revokePreview, setErrors, setFiles, setProgressByFile, setSuccesses]
  )

  const reset = useCallback(() => {
    setFiles((prev) => {
      prev.forEach(revokePreview)
      return []
    })
    setErrors([])
    setSuccesses([])
    setProgressByFile({})
  }, [revokePreview, setErrors, setFiles, setProgressByFile, setSuccesses])

  return {
    files,
    setFiles,
    successes,
    setSuccesses,
    isSuccess,
    loading,
    errors,
    setErrors,
    progressByFile,
    removeFile,
    reset,
    onUpload,
    maxFileSize,
    maxFiles,
    allowedMimeTypes,
    ...dropzoneProps,
  }
}

export { useSupabaseUpload, type UseSupabaseUploadOptions, type UseSupabaseUploadReturn }
