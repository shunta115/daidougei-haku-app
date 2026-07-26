import { useState, type ImgHTMLAttributes } from 'react'

type SafeImgProps = ImgHTMLAttributes<HTMLImageElement> & {
  /** 読み込み失敗時に非表示（親の gradient / initials に任せる） */
  hideOnError?: boolean
}

/** 外部画像の読み込み失敗でもレイアウトを崩さない */
export function SafeImg({ hideOnError = true, onError, alt = '', ...rest }: SafeImgProps) {
  const [failed, setFailed] = useState(false)
  if (failed && hideOnError) return null
  return (
    <img
      {...rest}
      alt={alt}
      onError={(e) => {
        setFailed(true)
        onError?.(e)
      }}
    />
  )
}
