export function isSupportedQRImage(file: File): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp)$/.test(name)
}

export function firstSupportedQRImageFile(files?: FileList | File[] | null): File | null {
  if (!files?.length) return null
  return Array.from(files).find(isSupportedQRImage) ?? null
}

export function supportedQRImageFromTransfer(transfer?: DataTransfer | null): File | null {
  const directFile = firstSupportedQRImageFile(transfer?.files)
  if (directFile) return directFile
  for (const item of Array.from(transfer?.items ?? [])) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file && isSupportedQRImage(file)) return file
  }
  return null
}

export function hasPotentialQRImage(transfer?: DataTransfer | null): boolean {
  if (supportedQRImageFromTransfer(transfer)) return true
  return Array.from(transfer?.items ?? []).some((item) =>
    item.kind === 'file' && (!item.type || item.type.toLowerCase().startsWith('image/')),
  )
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}
