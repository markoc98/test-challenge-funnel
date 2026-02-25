import { File, Loader2, Upload, X } from 'lucide-react'
import { createContext, useCallback, useContext, type PropsWithChildren } from 'react'

import { cn } from '@/lib/utils'
import { type UseSupabaseUploadReturn } from '@/hooks/use-supabase-upload'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

const formatBytes = (
  bytes: number,
  decimals = 2,
  size?: 'bytes' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB' | 'EB' | 'ZB' | 'YB'
) => {
  const k = 1000
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  if (bytes === 0 || bytes === undefined) return size !== undefined ? `0 ${size}` : '0 bytes'
  const i = size !== undefined ? sizes.indexOf(size) : Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

type DropzoneContextType = Omit<UseSupabaseUploadReturn, 'getRootProps' | 'getInputProps'>

const DropzoneContext = createContext<DropzoneContextType | undefined>(undefined)

type DropzoneProps = UseSupabaseUploadReturn & {
  className?: string
}

const Dropzone = ({
  className,
  children,
  getRootProps,
  getInputProps,
  ...restProps
}: PropsWithChildren<DropzoneProps>) => {
  const isSuccess = restProps.isSuccess
  const isActive = restProps.isDragActive
  const isInvalid =
    (restProps.isDragActive && restProps.isDragReject) ||
    (restProps.errors.length > 0 && !restProps.isSuccess) ||
    restProps.files.some((file) => file.errors.length !== 0)

  return (
    <DropzoneContext.Provider value={{ ...restProps }}>
      <div
        {...getRootProps({
          className: cn(
            'rounded-xl border border-border/80 bg-gradient-to-b from-card to-muted/20 p-5 text-center text-foreground shadow-sm transition-all duration-200',
            className,
            isSuccess ? 'border-solid' : 'border-dashed',
            isActive && 'border-primary bg-primary/5 ring-2 ring-primary/20',
            isInvalid && 'border-destructive bg-destructive/5 ring-2 ring-destructive/15'
          ),
        })}
      >
        <input {...getInputProps()} />
        {children}
      </div>
    </DropzoneContext.Provider>
  )
}
const DropzoneContent = ({ className }: { className?: string }) => {
  const {
    files,
    removeFile,
    onUpload,
    loading,
    successes,
    errors,
    progressByFile,
    maxFileSize,
    maxFiles,
  } = useDropzoneContext()

  const exceedMaxFiles = files.length > maxFiles
  const successfulNames = new Set(successes)
  const hasPendingUploads = files.some((file) => !successfulNames.has(file.name))

  const handleRemoveFile = useCallback(
    (fileName: string) => {
      removeFile(fileName)
    },
    [removeFile]
  )

  return (
    <div className={cn('flex flex-col', className)}>
      {files.map((file, idx) => {
        const fileError = errors.find((e) => e.name === file.name)
        const isSuccessfullyUploaded = successfulNames.has(file.name)
        const progress = progressByFile[file.name]
        const progressValue =
          file.errors.length > 0
            ? 0
            : isSuccessfullyUploaded
              ? 100
              : progress?.progress ?? 0

        const statusText = file.errors.length > 0
          ? file.errors
              .map((e) =>
                e.message.startsWith('File is larger than')
                  ? `File is larger than ${formatBytes(maxFileSize, 2)} (Size: ${formatBytes(file.size, 2)})`
                  : e.message
              )
              .join(', ')
          : fileError
            ? `Upload failed: ${fileError.message}`
            : isSuccessfullyUploaded
              ? 'Uploaded'
              : progress?.status === 'finalizing'
                ? 'Finalizing...'
                : progress?.status === 'uploading'
                  ? `Uploading ${progressValue}%`
                  : 'Queued'

        const metaText =
          file.errors.length > 0 || fileError
            ? null
            : progress?.status === 'uploading' || progress?.status === 'finalizing'
              ? `${formatBytes(progress.uploadedBytes, 2)} / ${formatBytes(progress.totalBytes || file.size, 2)}`
              : formatBytes(file.size, 2)

        return (
          <div
            key={`${file.name}-${idx}`}
            className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 border-b py-3 first:mt-4 last:mb-4"
          >
            {file.type.startsWith('image/') ? (
              <div className="h-10 w-10 rounded border overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                <img src={file.preview} alt={file.name} className="object-cover" />
              </div>
            ) : (
              <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center">
                <File size={18} />
              </div>
            )}

            <div className="min-w-0">
              <p title={file.name} className="max-w-full truncate text-sm">
                {file.name}
              </p>
              <p
                className={cn(
                  'text-xs',
                  file.errors.length > 0 || fileError
                    ? 'text-destructive'
                    : isSuccessfullyUploaded
                      ? 'text-emerald-600'
                      : 'text-muted-foreground'
                )}
              >
                {statusText}
              </p>
              {metaText && (
                <p className="mt-0.5 text-xs text-muted-foreground">{metaText}</p>
              )}
              {file.errors.length === 0 && (
                <Progress
                  value={progressValue}
                  className={cn(
                    'mt-2 h-1.5',
                    fileError && 'bg-destructive/20',
                    isSuccessfullyUploaded && 'bg-emerald-200/60'
                  )}
                />
              )}
            </div>

            {!loading && !isSuccessfullyUploaded && (
              <Button
                size="icon"
                variant="link"
                className="shrink-0 justify-self-end text-muted-foreground hover:text-foreground"
                onClick={() => handleRemoveFile(file.name)}
              >
                <X />
              </Button>
            )}
          </div>
        )
      })}
      {exceedMaxFiles && (
        <p className="text-sm text-left mt-2 text-destructive">
          You may upload only up to {maxFiles} files, please remove {files.length - maxFiles} file
          {files.length - maxFiles > 1 ? 's' : ''}.
        </p>
      )}
      {files.length > 0 && !exceedMaxFiles && hasPendingUploads && (
        <div className="mt-2">
          <Button
            variant="outline"
            onClick={onUpload}
            disabled={files.some((file) => file.errors.length !== 0) || loading}
            className="w-full sm:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>Start upload</>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

const DropzoneEmptyState = ({ className }: { className?: string }) => {
  const { maxFiles, maxFileSize, inputRef, isSuccess } = useDropzoneContext()

  if (isSuccess) {
    return null
  }

  return (
    <div className={cn('flex flex-col items-center gap-y-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6', className)}>
      <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Upload size={18} />
      </div>
      <div className="flex flex-col items-center gap-y-1">
        <p className="text-xs text-muted-foreground">
          Drag and drop or{' '}
          <a
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer underline underline-offset-4 transition hover:text-foreground"
          >
            select {maxFiles === 1 ? `file` : 'files'}
          </a>{' '}
          to upload
        </p>
        {maxFileSize !== Number.POSITIVE_INFINITY && (
          <p className="text-xs text-muted-foreground">
            Maximum file size: {formatBytes(maxFileSize, 2)}
          </p>
        )}
      </div>
    </div>
  )
}

const useDropzoneContext = () => {
  const context = useContext(DropzoneContext)

  if (!context) {
    throw new Error('useDropzoneContext must be used within a Dropzone')
  }

  return context
}

export { Dropzone, DropzoneContent, DropzoneEmptyState }
