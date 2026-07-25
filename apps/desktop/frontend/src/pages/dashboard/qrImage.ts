export function firstSupportedQRImageFile(files?: FileList | File[] | null): File | null {
  if (!files?.length) {
    return null
  }
  for (const file of Array.from(files)) {
    if (isSupportedQRImage(file)) {
      return file
    }
  }
  return null
}

export function isSupportedQRImage(file: File): boolean {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp)$/.test(name)
}
