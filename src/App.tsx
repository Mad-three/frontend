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
  const audioContextRef = useRef<AudioContext | null>(null) // Web Audio API의 AudioContext 저장

  // WebSocket 연결 함수
  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return // 이미 연결되어 있으면 중복 연결 방지
    }

    setConnectionStatus('connecting')
    
    // WebSocket 서버 주소
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

  // 녹음 시작 및 오디오 스트리밍 함수 (48000Hz로 리샘플링)
  const startRecording = async () => {
    // 서버와 연결되지 않았으면 경고 후 종료
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      alert('서버와 연결되지 않았습니다.');
      return;
    }
    // 이미 녹음 중이면 중복 실행 방지
    if (isRecording) return;

    try {
      // 1. Web Audio API를 사용하여 48000Hz로 리샘플링 준비
      //    - 새로운 AudioContext를 목표 샘플링 레이트로 생성
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;

      // 2. 사용자 마이크에 접근하여 원본 MediaStream 획득
      const originalStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3. 원본 스트림을 AudioContext의 소스로 연결
      const source = audioContext.createMediaStreamSource(originalStream);
      
      // 4. 리샘플링된 오디오를 출력할 목적지(destination) 노드 생성
      const destination = audioContext.createMediaStreamDestination();
      
      // 5. 소스(원본) -> 목적지(리샘플링)로 연결
      source.connect(destination);

      // 6. 리샘플링된 스트림을 MediaRecorder에 사용
      //    - 이제 destination.stream은 항상 48000Hz 오디오 데이터를 가짐
      const resampledStream = destination.stream;
      mediaStreamRef.current = resampledStream; // 나중에 정리할 수 있도록 저장

      const mediaRecorder = new MediaRecorder(resampledStream, {
        mimeType: 'audio/webm; codecs=opus',
      });
      mediaRecorderRef.current = mediaRecorder;

      // 7. ondataavailable 이벤트 핸들러 설정
      mediaRecorder.ondataavailable = (event) => {
        // 데이터가 있고, WebSocket이 열려있을 때만 서버로 전송
        if (event.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          // 순수한 바이너리 데이터(Blob)를 직접 전송
          wsRef.current.send(event.data);
        }
      };

      // 8. 녹음 상태 변경을 위한 이벤트 핸들러
      mediaRecorder.onstart = () => {
        setIsRecording(true);
        console.log('녹음 시작됨 (48000Hz).');
      };

      // 녹음이 중지될 때 모든 오디오 관련 리소스를 정리
      mediaRecorder.onstop = () => {
        // 모든 오디오 트랙 (원본, 리샘플링된 것) 중지
        originalStream.getTracks().forEach(track => track.stop());
        resampledStream.getTracks().forEach(track => track.stop());
        
        // AudioContext 닫기 (메모리 해제)
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }

        setIsRecording(false);
        console.log('녹음 중지됨. 모든 오디오 리소스 해제.');
      };

      // 9. 녹음 시작
      mediaRecorder.start(250);

    } catch (error) {
      console.error('마이크 접근 또는 리샘플링 오류:', error);
      alert('마이크에 접근할 수 없거나 오디오 처리에 실패했습니다. 브라우저의 권한 설정을 확인해주세요.');
    }
  };

  // 녹음 중지 함수
  const stopRecording = () => {
    // MediaRecorder가 실행 중일 때만 stop()을 호출.
    // stop()이 호출되면 자동으로 onstop 이벤트 핸들러가 실행되어 리소스를 정리함.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };


  // 컴포넌트가 언마운트될 때 실행되는 정리(cleanup) 함수
  useEffect(() => {
    // 이 effect는 의존성 배열이 비어있으므로( [] ),
    // 컴포넌트가 처음 렌더링될 때 한 번만 실행되고,
    // 컴포넌트가 화면에서 사라질 때(unmount) return 안의 함수가 실행됩니다.
    return () => {
      console.log('컴포넌트 언마운트: 모든 리소스를 정리합니다.');

      // 녹음 중이었다면 확실히 중지 (onstop 핸들러가 리소스 정리를 처리)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      
      // useEffect의 cleanup에서는 stream과 context 직접 정리는 onstop에 위임하고,
      // 혹시 모를 WebSocket 연결만 확인하고 닫음
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []); // 의존성 배열을 비워 unmount 시에만 실행되도록 수정

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
