// Shared share-card utilities used by all four modules (gua / xie / xun / du).
// Canvas API is only called inside async functions, so this file is safe to
// import from 'use client' components — it is never executed on the server.

export const SHARE_WIDTH = 1080
export const SHARE_MARGIN = 84
export const SHARE_QR_SIZE = 100
export const SHARE_QR_OPACITY = 0.45
export const SHARE_FONT_FAMILY = '"Noto Serif SC", serif'
export const SHARE_SITE_URL = 'https://xz.air7.fun'

const SHARE_QR_PATH = '/qr-xz-air7-fun.svg'

const loadQrImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })

/**
 * Draw the unified footer: brand text bottom-left, QR code bottom-right.
 *
 * @param footerTopY  Top edge of the footer area (= where QR top starts).
 * @param moduleLabel Short module name, e.g. '问心' | '述怀' | '寻章' | '慢读'
 */
export const drawShareFooter = async (
  ctx: CanvasRenderingContext2D,
  w: number,
  footerTopY: number,
  moduleLabel: string
): Promise<void> => {
  const margin = SHARE_MARGIN
  const qrSize = SHARE_QR_SIZE

  ctx.fillStyle = '#96836e'
  ctx.font = `400 26px ${SHARE_FONT_FAMILY}`
  ctx.textBaseline = 'middle'
  ctx.fillText(`小庄·${moduleLabel}  ${SHARE_SITE_URL}`, margin, footerTopY + qrSize / 2)
  ctx.textBaseline = 'top'

  try {
    const qrImage = await loadQrImage(SHARE_QR_PATH)
    ctx.globalAlpha = SHARE_QR_OPACITY
    ctx.drawImage(qrImage, w - margin - qrSize, footerTopY, qrSize, qrSize)
    ctx.globalAlpha = 1
  } catch {
    // QR 加载失败不影响整体生成
  }
}
