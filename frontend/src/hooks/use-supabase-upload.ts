import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone, type FileError, type FileRejection } from 'react-dropzone'

import { supabase } from '@/lib/client'

interface FileWithPreview extends File {
  preview?: string
  errors: readonly FileError[]
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

        return [...prev, ...validFiles, ...invalidFiles]
      })
    },
    [setFiles]
  )

  const dropzoneProps = useDropzone({
    onDrop,
    noClick: true,
    accept: allowedMimeTypes.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxSize: maxFileSize,
    maxFiles,
    multiple: maxFiles !== 1,
  })

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

    const retryNames = new Set(filesToUpload.map((f) => f.name))
    setErrors((prev) => prev.filter((e) => !retryNames.has(e.name)))

    await Promise.all(
      filesToUpload.map(async (file) => {
        const ext = file.name.substring(file.name.lastIndexOf('.'))
        const storageName = `${crypto.randomUUID()}${ext}`
        const fullPath = path ? `${path}/${storageName}` : storageName

        try {
          const { error } = await supabase.storage.from(bucketName).upload(fullPath, file, {
            cacheControl: cacheControl.toString(),
            upsert,
          })
          if (error) throw error

          await onFileUploaded?.(file.name, fullPath)

          setErrors((prev) => prev.filter((item) => item.name !== file.name))
          setSuccesses((prev) => (prev.includes(file.name) ? prev : [...prev, file.name]))
        } catch (uploadError: unknown) {
          const message =
            uploadError instanceof Error ? uploadError.message : 'Failed to upload file'
          setErrors((prev) => [
            ...prev.filter((item) => item.name !== file.name),
            { name: file.name, message },
          ])
        }
      })
    )

    setLoading(false)
  }, [
    bucketName,
    cacheControl,
    errors,
    files,
    onFileUploaded,
    path,
    setErrors,
    setLoading,
    setSuccesses,
    successes,
    upsert,
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
      setErrors((prev) => prev.filter((item) => item.name !== fileName))
      setSuccesses((prev) => prev.filter((name) => name !== fileName))
    },
    [revokePreview, setErrors, setFiles, setSuccesses]
  )

  const reset = useCallback(() => {
    setFiles((prev) => {
      prev.forEach(revokePreview)
      return []
    })
    setErrors([])
    setSuccesses([])
  }, [revokePreview, setErrors, setFiles, setSuccesses])

  return {
    files,
    setFiles,
    successes,
    setSuccesses,
    isSuccess,
    loading,
    errors,
    setErrors,
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
