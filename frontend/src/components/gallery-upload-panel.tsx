import { Upload } from 'lucide-react'

import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from '@/components/dropzone'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import type { UseSupabaseUploadReturn } from '@/hooks/use-supabase-upload'

type GalleryUploadPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReset: () => void
  uploadProps: UseSupabaseUploadReturn
}

function GalleryUploadPanel({
  open,
  onOpenChange,
  onReset,
  uploadProps,
}: GalleryUploadPanelProps) {
  const isMobile = useIsMobile()
  const canReset =
    !uploadProps.loading &&
    uploadProps.files.length > 0 &&
    (uploadProps.isSuccess || uploadProps.errors.length > 0)

  const content = (
    <ScrollArea className="max-h-[52vh] md:max-h-[calc(100dvh-12rem)]">
      <Dropzone {...uploadProps} className="p-4">
        <DropzoneEmptyState className="py-4" />
        <DropzoneContent />
      </Dropzone>
      {canReset && (
        <div className="px-4 pb-4">
          <Button size="sm" variant="outline" onClick={onReset}>
            Upload more
          </Button>
        </div>
      )}
    </ScrollArea>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Upload className="size-4" />
              Upload images
            </DrawerTitle>
            <DrawerDescription>
              Drag and drop JPEG or PNG files with per-file progress tracking.
            </DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Upload className="size-4" />
            Upload images
          </SheetTitle>
          <SheetDescription>
            Drag and drop JPEG or PNG files with per-file progress tracking.
          </SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  )
}

export { GalleryUploadPanel }
