/**
 * SGF 파일 바이트를 문자열로 변환.
 * 타이젬·오로 등 한국 사이트 기보는 EUC-KR(CP949)인 경우가 많아 자동 판별함.
 */
export function decodeSgfBytes(bytes: Uint8Array): string {
  // UTF-8 BOM
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // UTF-8이 아님 → 파일에 적힌 CA(문자셋) 확인
  }
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2000))
  const ca = /CA\s*\[([^\]]*)\]/i.exec(head)?.[1]?.trim().toLowerCase()
  const candidates = [ca, 'euc-kr'].filter(
    (c): c is string => !!c && !/^(utf-?8|iso-?8859-?1|latin-?1|us-ascii|ascii)$/.test(c),
  )
  for (const label of candidates) {
    try {
      return new TextDecoder(label).decode(bytes)
    } catch {
      // 브라우저가 모르는 문자셋 이름이면 다음 후보로
    }
  }
  return new TextDecoder('utf-8').decode(bytes)
}
