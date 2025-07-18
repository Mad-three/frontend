import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [messages, setMessages] = useState<string[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const [inputMessage, setInputMessage] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  // WebSocket 연결 함수
  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return // 이미 연결되어 있으면 중복 연결 방지
    }

    setConnectionStatus('connecting')
    
    // WebSocket 서버 주소 (필요에 따라 수정하세요)
    const ws = new WebSocket('ws://localhost:8000/ws')

    ws.onopen = () => {
      console.log('WebSocket 연결 성공')
      setConnectionStatus('connected')
    }
    
    ws.onmessage = (event) => {
      console.log('서버로부터 메시지 수신:', event.data)
      
      try {
        // JSON 형태의 메시지인지 확인하고 파싱
        const messageData = JSON.parse(event.data)
        
        // 메시지 객체에 message 필드가 있으면 해당 내용을 표시
        if (messageData.message) {
          setMessages(prev => [...prev, messageData.message])
        } else {
          // message 필드가 없으면 전체 데이터를 문자열로 표시
          setMessages(prev => [...prev, event.data])
        }
      } catch {
        // JSON이 아닌 일반 텍스트 메시지인 경우 그대로 표시
        console.log('일반 텍스트 메시지:', event.data)
        setMessages(prev => [...prev, event.data])
      }
    }
    
    ws.onclose = () => {
      console.log('WebSocket 연결 종료')
      setConnectionStatus('disconnected')
    }
    
    ws.onerror = (error) => {
      console.error('WebSocket 오류:', error)
      setConnectionStatus('disconnected')
    }
    
    wsRef.current = ws
  }

  // WebSocket 연결 해제 함수
  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }

  // 메시지 전송 함수
  const sendMessage = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN && inputMessage.trim()) {
      wsRef.current.send(inputMessage)
      setInputMessage('')
    }
  }

  // 컴포넌트 언마운트 시 WebSocket 연결 해제
  useEffect(() => {
    return () => {
      disconnectWebSocket()
    }
  }, [])

  return (
    <>      
      <div className="card">
        {/* 연결 상태 표시 */}
        <div style={{ marginBottom: '20px' }}>
          <h3>연결 상태: 
            <span style={{ 
              color: connectionStatus === 'connected' ? 'green' : 
                     connectionStatus === 'connecting' ? 'orange' : 'red' 
            }}>
              {connectionStatus === 'connected' ? ' 연결됨' : 
               connectionStatus === 'connecting' ? ' 연결 중...' : ' 연결 안됨'}
            </span>
          </h3>
          
          {connectionStatus === 'disconnected' && (
            <button onClick={connectWebSocket}>
              서버에 연결하기
            </button>
          )}
          
          {connectionStatus === 'connected' && (
            <button onClick={disconnectWebSocket}>
              연결 끊기
            </button>
          )}
        </div>

        {/* 메시지 전송 */}
        {connectionStatus === 'connected' && (
          <div style={{ marginBottom: '20px' }}>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="메시지를 입력하세요"
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              style={{ marginRight: '10px', padding: '5px' }}
            />
            <button onClick={sendMessage}>전송</button>
          </div>
        )}

        {/* 받은 메시지 목록 */}
        <div>
          <h3>받은 메시지:</h3>
          <div style={{ 
            border: '1px solid #ccc', 
            padding: '10px', 
            maxHeight: '300px', 
            overflowY: 'auto',
            backgroundColor: '#f9f9f9'
          }}>
            {messages.length === 0 ? (
              <p>아직 받은 메시지가 없습니다.</p>
            ) : (
              messages.map((message, index) => (
                <div key={index} style={{ 
                  marginBottom: '5px', 
                  padding: '5px',
                  backgroundColor: 'white',
                  borderRadius: '3px'
                }}>
                  {message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default App
