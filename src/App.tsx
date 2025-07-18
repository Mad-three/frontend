import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  // 컴포넌트의 상태 변수들
  const [messages, setMessages] = useState<string[]>([]) // 서버로부터 받은 메시지 목록
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected') // WebSocket 연결 상태
  const wsRef = useRef<WebSocket | null>(null) // WebSocket 인스턴스를 저장하기 위한 Ref

  // 음성 녹음 관련 상태 및 Ref
  const [isRecording, setIsRecording] = useState(false) // 현재 녹음 중인지 여부
  const mediaRecorderRef = useRef<MediaRecorder | null>(null) // MediaRecorder 인스턴스 저장
  const mediaStreamRef = useRef<MediaStream | null>(null) // MediaStream (마이크 입력) 저장

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
    // 녹음 중이었다면 먼저 중지
    if (isRecording) {
      stopRecording()
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }

  // 녹음 시작 및 오디오 스트리밍 함수
  const startRecording = async () => {
    // 서버와 연결되지 않았으면 경고 후 종료
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      alert('서버와 연결되지 않았습니다.');
      return;
    }
    // 이미 녹음 중이면 중복 실행 방지
    if (isRecording) return;

    try {
      // 1. 사용자 마이크에 접근하여 MediaStream 객체 획득
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // 2. MediaStream을 기반으로 MediaRecorder 인스턴스 생성
      //    - mimeType: 'audio/webm; codecs=opus'는 실시간 스트리밍에 효율적인 코덱.
      //      백엔드(Google STT) 설정과 일치해야 함.
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm; codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;

      // 3. ondataavailable 이벤트 핸들러 설정
      //    - MediaRecorder가 오디오 데이터를 청크(조각)로 만들 때마다 호출됨.
      mediaRecorder.ondataavailable = (event) => {
        // 데이터가 있고, WebSocket이 열려있을 때만 서버로 전송
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data);
        }
      };

      // 4. 녹음 상태 변경을 위한 이벤트 핸들러
      mediaRecorder.onstart = () => {
        setIsRecording(true);
      };

      mediaRecorder.onstop = () => {
        setIsRecording(false);
      };

      // 5. 녹음 시작
      //    - 250ms 마다 ondataavailable 이벤트를 발생시켜 데이터를 청크로 분할.
      mediaRecorder.start(250);

    } catch (error) {
      console.error('마이크 접근 오류:', error);
      alert('마이크에 접근할 수 없습니다. 브라우저의 권한 설정을 확인해주세요.');
    }
  };

  // 녹음 중지 함수
  const stopRecording = () => {
    // MediaRecorder가 실행 중일 때만 중지
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    // MediaStream이 활성화 상태일 때 모든 트랙을 중지하여 마이크 사용 해제
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };


  // 컴포넌트가 언마운트될 때 실행되는 정리(cleanup) 함수
  useEffect(() => {
    return () => {
      // 녹음 중이었다면 리소스 해제
      if (isRecording) {
        stopRecording();
      }
      // WebSocket 연결 해제
      disconnectWebSocket()
    }
  }, [isRecording]) // isRecording 상태가 바뀔 때도 이 effect를 재평가

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
          
          {/* 서버 연결/해제 버튼 */}
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

        {/* 음성 인식 컨트롤: 서버에 연결된 경우에만 보임 */}
        {connectionStatus === 'connected' && (
          <div style={{ marginBottom: '20px' }}>
            <h3>실시간 음성 인식</h3>
            {/* isRecording 상태에 따라 '녹음 시작' 또는 '녹음 중지' 버튼을 표시 */}
            {!isRecording ? (
              <button onClick={startRecording} disabled={connectionStatus !== 'connected'}>
                녹음 시작
              </button>
            ) : (
              <button onClick={stopRecording}>
                녹음 중지
              </button>
            )}
          </div>
        )}

        {/* 받은 메시지 목록 */}
        <div>
          <h3>서버로부터 변환된 텍스트:</h3>
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
