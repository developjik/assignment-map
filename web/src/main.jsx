import React from 'react'
import ReactDOM from 'react-dom'
import App from './App'

// 레거시 동기 렌더 사용. 이유: 임베디드 브라우저 컨텍스트에서 createRoot의
// 동시성 커밋이 무음 스톨하는 환경이 관측됨(2026-10-24). 동기 렌더는 어디서나 동작.
// 배포 환경 안정화 후 createRoot 재전환 검토. deprecation 경고는 알려진 비용.
ReactDOM.render(<App />, document.getElementById('root'))
