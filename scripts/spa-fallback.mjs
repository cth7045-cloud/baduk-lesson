// 정적 호스팅(Render)에서 /lessons/123 같은 주소로 바로 들어오거나 새로고침해도
// 앱이 열리도록, 없는 주소일 때 보여 줄 404.html 을 앱 첫 화면(index.html)과 같게 만듦
import { copyFileSync } from 'node:fs'
copyFileSync('dist/index.html', 'dist/404.html')
console.log('dist/404.html 생성 (주소 직접 접속·새로고침 대비)')
