/** SGF 원본 구조: 속성 묶음 + 자식 노드 */
export interface SgfNode {
  props: Record<string, string[]>
  children: SgfNode[]
}

export class SgfParseError extends Error {}

/**
 * SGF 텍스트를 읽어 게임 트리 목록을 돌려줌 (보통 파일 하나에 대국 하나).
 * 깊은 변화도에서도 스택이 넘치지 않도록 재귀 없이 처리.
 */
export function parseSgf(text: string): SgfNode[] {
  const roots: SgfNode[] = []
  // 각 '(' 마다 [분기 시작점의 부모, 현재 마지막 노드]를 쌓음
  const stack: { parent: SgfNode | null; last: SgfNode | null }[] = []
  let i = 0
  const n = text.length

  const attach = (node: SgfNode) => {
    const top = stack[stack.length - 1]
    if (top.last) top.last.children.push(node)
    else if (top.parent) top.parent.children.push(node)
    else roots.push(node)
    top.last = node
  }

  while (i < n) {
    const ch = text[i]
    if (ch === '(') {
      const top = stack[stack.length - 1]
      stack.push({ parent: top ? (top.last ?? top.parent) : null, last: null })
      i++
    } else if (ch === ')') {
      if (!stack.length) throw new SgfParseError('괄호 짝이 맞지 않습니다.')
      stack.pop()
      i++
      if (!stack.length && roots.length) {
        // 첫 번째 게임 트리 이후의 내용은 계속 읽되, 쓰레기 문자는 무시
      }
    } else if (ch === ';') {
      if (!stack.length) throw new SgfParseError('SGF 형식이 아닙니다.')
      i++
      const node: SgfNode = { props: {}, children: [] }
      // 속성들 읽기
      for (;;) {
        while (i < n && /\s/.test(text[i])) i++
        // 속성 이름: 대문자(FF3의 소문자 혼용은 소문자 무시)
        let ident = ''
        const start = i
        while (i < n && /[A-Za-z]/.test(text[i])) {
          if (text[i] >= 'A' && text[i] <= 'Z') ident += text[i]
          i++
        }
        if (i === start) break
        while (i < n && /\s/.test(text[i])) i++
        const values: string[] = []
        while (i < n && text[i] === '[') {
          i++
          let v = ''
          while (i < n && text[i] !== ']') {
            if (text[i] === '\\') {
              i++
              if (i >= n) break
              // 줄바꿈 이스케이프(soft line break)는 지움
              if (text[i] === '\n') {
                i++
                if (text[i] === '\r') i++
                continue
              }
              if (text[i] === '\r') {
                i++
                if (text[i] === '\n') i++
                continue
              }
            }
            v += text[i]
            i++
          }
          if (i >= n) throw new SgfParseError('속성 값이 닫히지 않았습니다.')
          i++ // ']'
          values.push(v.replace(/\r\n?/g, '\n'))
          while (i < n && /\s/.test(text[i])) i++
        }
        if (ident) node.props[ident] = (node.props[ident] ?? []).concat(values)
      }
      attach(node)
    } else {
      i++ // 공백 및 괄호 밖 문자 무시
    }
  }
  if (stack.length) {
    // 끝 괄호가 빠진 파일도 최대한 살림
  }
  if (!roots.length) throw new SgfParseError('기보 내용을 찾을 수 없습니다.')
  return roots
}
