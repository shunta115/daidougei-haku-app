export async function prepareProfilePhoto(file: File): Promise<File> {
  if (file.size > 30 * 1024 * 1024) throw new Error('写真は30MB以下のものを選んでください。')
  if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type)) throw new Error('写真はJPEG・PNG・WebPで選んでください。iPhoneでは写真の共有メニューからJPEGに変換できます。')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode().catch(() => { throw new Error('この写真を読み込めませんでした。JPEGまたはPNGの写真を選び直してください。') })
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('写真を処理できませんでした。別の写真でお試しください。')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob || blob.size > 5 * 1024 * 1024) throw new Error('写真を小さくしてから、もう一度お試しください。')
    return new File([blob], 'profile.jpg', { type: 'image/jpeg' })
  } finally { URL.revokeObjectURL(url) }
}
