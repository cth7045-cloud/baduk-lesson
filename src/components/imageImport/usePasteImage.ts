import { useEffect, useRef } from 'react'
import { imageFromClipboard } from './ImageImportDialog'

/** 화면 어디서든 Ctrl+V 로 이미지를 붙여넣으면 onImage (글자 붙여넣기는 그대로) */
export function usePasteImage(enabled: boolean, onImage: (file: File) => void) {
  const cb = useRef(onImage)
  cb.current = onImage
  useEffect(() => {
    if (!enabled) return
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromClipboard(e)
      if (!file) return
      e.preventDefault()
      cb.current(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [enabled])
}
