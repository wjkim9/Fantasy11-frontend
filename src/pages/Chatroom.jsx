import React, {useState, useEffect, useRef, useCallback} from 'react';
import './Chatroom.css';
import {useNavigate, useParams} from 'react-router-dom';
import {useInView} from 'react-intersection-observer';
import SockJS from 'sockjs-client';
import {Client} from '@stomp/stompjs';
import debounce from 'lodash.debounce';
// import axiosInstance from '../api/axiosConfig'; // 프로젝트 구조에 맞게 경로 수정 필요
import axios from 'axios';

// axiosInstance 직접 생성 (동적 토큰 처리)
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
});

// 요청 인터셉터 추가
axiosInstance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
);

const RAW_WS_BASE =
    (typeof import.meta !== 'undefined' &&
        import.meta.env &&
        import.meta.env.VITE_API_WS_URL) ||
    (typeof window !== 'undefined' && window.REACT_APP_WS_BASE_URL) ||
    'ws://localhost:8080';

// 끝 슬래시 제거 + ws/wss → http/https 변환
const SOCKJS_ORIGIN = RAW_WS_BASE
.replace(/\/$/, '')
.replace(/^wss:\/\//, 'https://')
.replace(/^ws:\/\//, 'http://');

export default function Chatroom() {
  const navigate = useNavigate();
  const {roomId} = useParams(); // URL에서 roomId 가져오기
  const chatRef = useRef(null);
  const stompClientRef = useRef(null);

  // roomId가 없으면 테스트용 ID 사용
  const actualRoomId = roomId || 'test-' + Date.now();

  // 기본 상태
  const [selectedParticipantId, setSelectedParticipantId] = useState(null);
  const [isComposing, setIsComposing] = useState(false);
  const [chatList, setChatList] = useState([]);
  const [message, setMessage] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  // 무한스크롤 관련 상태
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // 스코어보드 및 로스터 데이터
  const [scoreboard, setScoreboard] = useState([]);
  const [currentRoster, setCurrentRoster] = useState(null);

  // 사용자 정보
  const [currentUser, setCurrentUser] = useState(null);

  // 읽음 표시 관련 상태
  const [lastReadMessageId, setLastReadMessageId] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  // 탭 관련 상태
  const [activeTab, setActiveTab] = useState('participants'); // 'participants' | 'formation'

  // 최근 골/어시스트 알림 상태 (최대 3개 저장)
  const [recentAlerts, setRecentAlerts] = useState([]);

  // 검색 관련 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // 무한스크롤 감지를 위한 IntersectionObserver
  const {ref: loadMoreRef, inView} = useInView({
    threshold: 0,
    rootMargin: '100px 0px',
  });

  // JWT 토큰 가져오기
  const getAuthToken = () => {
    return localStorage.getItem('accessToken') || sessionStorage.getItem(
        'accessToken');
  };

  // 현재 사용자 정보 가져오기
  const fetchCurrentUser = async () => {
    try {
      // /api/users/me가 404면 다른 엔드포인트 시도
      const response = await axiosInstance.get('/api/user/me');
      setCurrentUser(response.data);
    } catch (error) {
      console.error('사용자 정보 로드 실패:', error);
      // 임시 사용자 정보 설정
      setCurrentUser({
        id: localStorage.getItem('userId') || 'test-user',
        email: localStorage.getItem('userEmail') || 'test@gmail.com'
      });
    }
  };

  // 스코어보드 정보 가져오기
  const fetchScoreboard = async () => {
    try {
      const response = await axiosInstance.get(
          `/api/chat-rooms/${roomId}/scoreboard`);
      setScoreboard(response.data);

      // 첫 번째 참가자를 기본 선택
      if (response.data.length > 0 && !selectedParticipantId) {
        setSelectedParticipantId(response.data[0].participantId);
      }
    } catch (error) {
      console.error('스코어보드 로드 실패:', error);
    }
  };

  // 선택된 참가자의 로스터 정보 가져오기
  const fetchRoster = async (participantId) => {
    if (!participantId) {
      return;
    }

    try {
      const response = await axiosInstance.get(
          `/api/chat-rooms/${roomId}/participants/${participantId}/roster`
      );
      setCurrentRoster(response.data);
    } catch (error) {
      console.error('로스터 로드 실패:', error);
    }
  };

  // 읽음 상태 조회
  const fetchReadState = async () => {
    try {
      const response = await axiosInstance.get(
          `/api/chat-rooms/${actualRoomId}/read-state`);
      setLastReadMessageId(response.data.lastReadMessageId);
      setUnreadCount(response.data.unreadCount);
    } catch (error) {
      console.error('읽음 상태 조회 실패:', error);
    }
  };

  // 읽음 표시 업데이트
  const markReadUpTo = async (messageId) => {
    try {
      const response = await axiosInstance.post(
          `/api/chat-rooms/${actualRoomId}/read-state`, {
            messageId: messageId
          });
      setUnreadCount(response.data.unreadCount);
      setLastReadMessageId(messageId);
    } catch (error) {
      console.error('읽음 표시 업데이트 실패:', error);
    }
  };

  // 읽음 표시 업데이트 디바운스
  const debouncedMarkRead = useCallback(
      debounce((messageId) => {
        markReadUpTo(messageId);
      }, 1000),
      [actualRoomId]
  );

  // 채팅 검색 함수
  const searchChatMessages = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await axiosInstance.get(
          `/api/chat-rooms/${actualRoomId}/search`, {
            params: {
              q: query.trim(),
              limit: 20
            }
          });

      const {items} = response.data;
      setSearchResults(items.map(formatMessage));
      setShowSearchResults(true);
    } catch (error) {
      console.error('채팅 검색 실패:', error);
      setSearchResults([]);
      setShowSearchResults(false);
    } finally {
      setIsSearching(false);
    }
  };

  // 검색 실행
  const handleSearch = () => {
    searchChatMessages(searchQuery);
  };

  // 검색 초기화
  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  // 시간 포맷
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // 메시지 포맷 변환
  const formatMessage = useCallback((item) => {
    // 사용자 이름 결정
    let userName = '시스템';
    if (item.type === 'ALERT' || item.type === 'SYSTEM') {
      userName = '⚽ 알림';
    } else if (item.userId) {
      // 스코어보드에서 사용자 정보 찾기
      const user = scoreboard.find(s => s.userId === item.userId);
      if (user) {
        userName = user.email;
      } else if (currentUser && item.userId === currentUser.id) {
        // 현재 사용자인 경우 현재 사용자 이메일 사용
        userName = currentUser.email;
      } else {
        // 디버깅: Unknown인 경우 정보 출력
        console.log('Unknown user detected:', {
          userId: item.userId,
          currentUser: currentUser,
          scoreboard: scoreboard,
          content: item.content
        });
        userName = 'Unknown';
      }
    }

    return {
      id: item.id,
      user: userName,
      text: item.content,
      time: formatTime(item.createdAt),
      type: item.type,
      userId: item.userId
    };
  }, [scoreboard, currentUser]);

  // 채팅 히스토리 초기 로드 (최신 메시지부터)
  const loadInitialHistory = async () => {
    if (loading) {
      return;
    }
    setLoading(true);

    try {
      // 최신 메시지부터 20개 가져오기 (백엔드에서 이미 처리됨)
      const response = await axiosInstance.get(
          `/api/chat-rooms/${actualRoomId}/messages`, {
            params: {limit: 20}
          });

      const {items, nextCursor: cursor, hasMore: more} = response.data;

      // 백엔드에서 이미 오래된->최신 순으로 정렬해서 반환하므로 그대로 사용
      setChatList(items.map(formatMessage));
      setNextCursor(cursor);
      setHasMore(more);
      setIsInitialLoad(false);

      // 초기 로드 완료 후 즉시 맨 아래로 스크롤 (애니메이션 없이)
      requestAnimationFrame(() => {
        if (chatRef.current) {
          chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
      });

    } catch (error) {
      console.error('채팅 히스토리 초기 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // 이전 메시지 로드 (무한스크롤)
  const loadMoreMessages = async () => {
    if (loading || !nextCursor || !hasMore) {
      return;
    }
    setLoading(true);

    try {
      const response = await axiosInstance.get(
          `/api/chat-rooms/${roomId}/messages/before`, {
            params: {
              cursor: nextCursor,
              limit: 20  // 20개씩 로드
            }
          });

      const {items, nextCursor: cursor, hasMore: more} = response.data;

      // 스크롤 위치 보존을 위해 현재 스크롤 높이 저장
      const currentScrollHeight = chatRef.current?.scrollHeight || 0;

      // 기존 메시지 위에 추가 (오래된 메시지를 위에)
      setChatList(prev => [...items.map(formatMessage), ...prev]);
      setNextCursor(cursor);
      setHasMore(more);

      // 스크롤 위치 조정 (새 메시지가 추가되어도 사용자가 보던 위치 유지)
      setTimeout(() => {
        if (chatRef.current) {
          const newScrollHeight = chatRef.current.scrollHeight;
          const heightDiff = newScrollHeight - currentScrollHeight;
          chatRef.current.scrollTop = chatRef.current.scrollTop + heightDiff;
        }
      }, 50);

    } catch (error) {
      console.error('이전 메시지 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // WebSocket 연결
  const connectWebSocket = useCallback(() => {
    if (stompClientRef.current?.connected) {
      return;
    }

    const token = getAuthToken();
    if (!token) {
      console.error('인증 토큰이 없습니다.');
      setIsConnected(false);
      return;
    }

    try {
      // 시크릿이 wss://여도 SOCKJS_ORIGIN이 https://로 변환됨
      const socket = new SockJS(`${SOCKJS_ORIGIN}/ws`);
      const stompClient = new Client({
        webSocketFactory: () => socket,
        connectHeaders: {
          'Authorization': `Bearer ${token}`
        },
        debug: (str) => {
          console.log('STOMP:', str);
        },
        onConnect: (frame) => {
          console.log('WebSocket 연결 성공:', frame);
          setIsConnected(true);

          // 채팅방 구독
          const subscription = stompClient.subscribe(
              `/topic/chat/${actualRoomId}`, (message) => {
                console.log('메시지 수신:', message.body);
                const newMessage = JSON.parse(message.body);

                // 사용자 이름 결정
                let userName = '시스템';
                if (newMessage.type === 'ALERT' || newMessage.type
                    === 'SYSTEM') {
                  userName = '⚽ 알림';
                } else if (newMessage.userId) {
                  const user = scoreboard.find(
                      s => s.userId === newMessage.userId);
                  if (user) {
                    userName = user.email;
                  } else if (currentUser && newMessage.userId
                      === currentUser.id) {
                    // 현재 사용자인 경우 현재 사용자 이메일 사용
                    userName = currentUser.email;
                  } else {
                    userName = 'Unknown';
                  }
                }

                const formattedMessage = {
                  id: newMessage.id || Date.now().toString(),
                  user: userName,
                  text: newMessage.content,
                  time: formatTime(newMessage.createdAt || new Date()),
                  type: newMessage.type,
                  userId: newMessage.userId
                };

                setChatList(prev => {
                  const newList = [...prev, formattedMessage];

                  // 새 메시지 추가 후 스크롤을 맨 아래로 (카카오톡 방식)
                  setTimeout(() => {
                    if (chatRef.current) {
                      chatRef.current.scrollTop = chatRef.current.scrollHeight;
                    }
                  }, 100);

                  return newList;
                });

                // 알림 메시지일 경우 스코어보드 새로고침 및 최근 알림에 추가
                if (newMessage.type === 'ALERT') {
                  fetchScoreboard();

                  // 골/어시스트 관련 알림인지 확인
                  const isGoalOrAssist = newMessage.content.includes('골') ||
                      newMessage.content.includes('어시스트') ||
                      newMessage.content.includes('득점') ||
                      newMessage.content.includes('도움');

                  if (isGoalOrAssist) {
                    setRecentAlerts(prev => {
                      const newAlert = {
                        id: newMessage.id || Date.now().toString(),
                        content: newMessage.content,
                        time: formatTime(newMessage.createdAt || new Date()),
                        type: 'goal-assist'
                      };

                      // 최대 3개까지만 저장 (최신순)
                      const updatedAlerts = [newAlert, ...prev].slice(0, 3);
                      return updatedAlerts;
                    });
                  }
                }
              }, {
                'Authorization': `Bearer ${token}`
              });

          console.log('구독 완료:', subscription);
        },
        onDisconnect: (frame) => {
          console.log('WebSocket 연결 해제:', frame);
          setIsConnected(false);
        },
        onStompError: (frame) => {
          console.error('STOMP 오류:', frame);
          setIsConnected(false);

          // 에러 메시지 파싱
          if (frame.headers && frame.headers.message) {
            console.error('오류 메시지:', frame.headers.message);
          }

          // 재연결 시도
          setTimeout(() => {
            if (!stompClientRef.current?.connected) {
              console.log('재연결 시도...');
              connectWebSocket();
            }
          }, 3000);
        },
        onWebSocketError: (error) => {
          console.error('WebSocket 오류:', error);
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000
      });

      stompClient.activate();
      stompClientRef.current = stompClient;
      console.log('STOMP 클라이언트 활성화됨');
    } catch (error) {
      console.error('WebSocket 연결 실패:', error);
      setIsConnected(false);
    }
  }, [actualRoomId, scoreboard]);

  // 메시지 전송
  const handleSendMessage = () => {

    if (isComposing) {
      return;
    }
    if (!message.trim()) {
      return;
    }

    if (!stompClientRef.current?.connected) {
      alert('채팅 서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const messageData = {
      roomId: actualRoomId,
      content: message.trim()
    };

    try {
      stompClientRef.current.publish({
        destination: `/app/chat/${actualRoomId}/send`,
        body: JSON.stringify(messageData)
      });
      setMessage('');
    } catch (error) {
      console.error('메시지 전송 실패:', error);
      alert('메시지 전송에 실패했습니다.');
    }
  };

  // 참가자 선택
  const handleSelectParticipant = (participantId) => {
    setSelectedParticipantId(participantId);
    fetchRoster(participantId);
  };

  // 채팅방 나가기
  const exitRoom = () => {
    if (window.confirm('채팅방에서 나가시겠습니까?')) {
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }
      navigate('/');
    }
  };

  // 무한스크롤 로드 디바운스
  const debouncedLoadMore = useCallback(
      debounce(() => {
        if (hasMore && !loading && !isInitialLoad) {
          loadMoreMessages();
        }
      }, 300),
      [hasMore, loading, nextCursor, isInitialLoad]
  );

  // 무한스크롤 트리거
  useEffect(() => {
    if (inView && hasMore && !loading && !isInitialLoad) {
      debouncedLoadMore();
    }
  }, [inView, hasMore, loading, isInitialLoad, debouncedLoadMore]);

  // 컴포넌트 마운트
  useEffect(() => {
    if (!roomId) {
      navigate('/');
      return;
    }

    // 데이터 로드
    fetchCurrentUser();
    fetchScoreboard();
    loadInitialHistory();
    fetchReadState();

    return () => {
      if (stompClientRef.current) {
        stompClientRef.current.deactivate();
      }
    };
  }, [roomId]);

  // 선택된 참가자 변경 시 로스터 로드
  useEffect(() => {
    if (selectedParticipantId) {
      fetchRoster(selectedParticipantId);
    }
  }, [selectedParticipantId]);

  // WebSocket 연결 (스코어보드 로드 후)
  useEffect(() => {
    if (scoreboard.length > 0 && !isConnected) {
      connectWebSocket();
    }
  }, [scoreboard, connectWebSocket]);

  // 사용자 정보 또는 스코어보드 업데이트 시 기존 메시지 다시 포맷팅
  useEffect(() => {
    if ((currentUser || scoreboard.length > 0) && chatList.length > 0) {
      setChatList(prevList =>
          prevList.map(msg => ({
            ...msg,
            user: (() => {
              // 메시지가 이미 포맷된 것이면서 userId가 있는 경우만 다시 처리
              if (!msg.userId || msg.user === '⚽ 알림' || msg.user === '시스템') {
                return msg.user;
              }

              // 스코어보드에서 사용자 정보 찾기
              const user = scoreboard.find(s => s.userId === msg.userId);
              if (user) {
                return user.email;
              } else if (currentUser && msg.userId === currentUser.id) {
                return currentUser.email;
              } else {
                return msg.user; // 기존 값 유지 (Unknown일 수도 있음)
              }
            })()
          }))
      );
    }
  }, [currentUser, scoreboard]);

  // 새 메시지 추가 시 스크롤 및 읽음 표시 업데이트
  useEffect(() => {
    if (chatRef.current && chatList.length > 0) {
      const {scrollTop, scrollHeight, clientHeight} = chatRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

      if (isNearBottom) {
        setTimeout(() => {
          if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
          }
        }, 100);

        // 최신 메시지를 읽음 처리 (디바운스 적용)
        const lastMessage = chatList[chatList.length - 1];
        if (lastMessage && lastMessage.id !== lastReadMessageId) {
          debouncedMarkRead(lastMessage.id);
        }
      }
    }
  }, [chatList, lastReadMessageId, debouncedMarkRead]);

  // 스크롤 이벤트로 읽음 표시 업데이트
  useEffect(() => {
    const handleScroll = () => {
      if (!chatRef.current || chatList.length === 0) {
        return;
      }

      const {scrollTop, scrollHeight, clientHeight} = chatRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

      if (isNearBottom) {
        const lastMessage = chatList[chatList.length - 1];
        if (lastMessage && lastMessage.id !== lastReadMessageId) {
          debouncedMarkRead(lastMessage.id);
        }
      }
    };

    const chatElement = chatRef.current;
    if (chatElement) {
      chatElement.addEventListener('scroll', handleScroll);
      return () => chatElement.removeEventListener('scroll', handleScroll);
    }
  }, [chatList, lastReadMessageId, debouncedMarkRead]);

  // 포메이션 렌더링 헬퍼
  const renderFormation = () => {
    if (!currentRoster) {
      return null;
    }

    const positions = {
      GK: [],
      DF: [],
      MID: [],
      FWD: []
    };

    currentRoster.players.forEach(player => {
      const pos = player.position === 'FW' ? 'FWD' : player.position;
      if (positions[pos]) {
        positions[pos].push(player);
      }
    });

    return (
        <>
          {Object.entries(positions).map(([position, players]) => (
              players.length > 0 && (
                  <div key={position} className="formation-line">
                    {players.map((player) => (
                        <div key={player.playerId} className="player-card">
                          <div className="player-photo-small"></div>
                          <div className="player-name-small">{player.name}</div>
                          <div
                              className="player-position-badge">{position}</div>
                        </div>
                    ))}
                  </div>
              )
          ))}
        </>
    );
  };

  return (
      <>
        <div className="header">
          <div className="logo">Fantasy11</div>
          <div className="room-info">
            <div className="status">
              접속중
              <span className={`connection-status ${isConnected ? 'connected'
                  : 'disconnected'}`}>
                            {isConnected ? ' ●' : ' ●'}
                        </span>
            </div>
            <button className="exit-btn" onClick={exitRoom}>나가기</button>
          </div>
        </div>

        <div className="main-container">
          <div className="left-section">
            {/* 탭 헤더 */}
            <div className="tab-header">
              <button
                  className={`tab-button ${activeTab === 'participants'
                      ? 'active' : ''}`}
                  onClick={() => setActiveTab('participants')}
              >
                참가자 순위
              </button>
              <button
                  className={`tab-button ${activeTab === 'formation' ? 'active'
                      : ''}`}
                  onClick={() => setActiveTab('formation')}
              >
                포메이션
              </button>
            </div>

            {/* 탭 내용 */}
            <div className="tab-content">
              {activeTab === 'participants' && (
                  <div className="participants-tab">
                    <div className="participants-list">
                      {scoreboard.map((participant, index) => {
                        // 메달 이모티콘 결정
                        const getMedalIcon = (rank) => {
                          switch (rank) {
                            case 1:
                              return '🥇';
                            case 2:
                              return '🥈';
                            case 3:
                              return '🥉';
                            default:
                              return '4️⃣';
                          }
                        };

                        const getRankText = (rank) => {
                          return `${rank}위`;
                        };

                        return (
                            <div
                                key={participant.participantId}
                                className={`participant-item ${selectedParticipantId
                                === participant.participantId ? 'active' : ''}`}
                                onClick={() => {
                                  handleSelectParticipant(
                                      participant.participantId);
                                  setActiveTab('formation'); // 선택 후 포메이션 탭으로 자동 이동
                                }}
                            >
                              <div className="participant-rank">
                                <span className="medal-icon">{getMedalIcon(
                                    participant.rank)}</span>
                                <span className="rank-text">{getRankText(
                                    participant.rank)}</span>
                              </div>
                              <div className="participant-info">
                                <div className="participant-name">
                                  {participant.email}
                                  {participant.userId === currentUser?.id
                                      && ' (나)'}
                                </div>
                                <div
                                    className="participant-points">{participant.totalPoints}점
                                </div>
                              </div>
                            </div>
                        );
                      })}
                    </div>

                    {/* 최근 골/어시스트 알림 영역 */}
                    <div className="recent-alerts">
                      <div className="alerts-header">
                        <span className="alerts-title">⚽ 최근 알림</span>
                      </div>
                      <div className="alerts-list">
                        {recentAlerts.length > 0 ? (
                            recentAlerts.map((alert) => (
                                <div key={alert.id} className="alert-item">
                                  <div
                                      className="alert-content">{alert.content}</div>
                                  <div className="alert-time">{alert.time}</div>
                                </div>
                            ))
                        ) : (
                            <div className="no-alerts">
                              아직 골/어시스트 알림이 없습니다
                            </div>
                        )}
                      </div>
                    </div>
                  </div>
              )}

              {activeTab === 'formation' && (
                  <div className="formation-tab">
                    <div className="formation-title">
                      {currentRoster ? `${scoreboard.find(
                          s => s.participantId === selectedParticipantId)?.email
                      || ''}의 팀` : '팀 선택'}
                      {currentRoster && ` (${currentRoster.formation})`}
                    </div>
                    <div className="formation-field">
                      <div className="field-lines"></div>
                      <div className="formation-container">
                        {renderFormation()}
                      </div>
                    </div>
                  </div>
              )}
            </div>
          </div>

          <div className="right-section">
            <div className="section-title">
              채팅
              {unreadCount > 0 && <span
                  className="unread-count">미읽음 {unreadCount}</span>}
              {loading && <span className="loading-indicator"> 로딩중...</span>}
            </div>

            {/* 채팅 검색 영역 */}
            <div className="chat-search-container">
              <input
                  type="text"
                  className="chat-search-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearch();
                    }
                  }}
                  placeholder="채팅 메시지 검색..."
              />
              <button
                  className="chat-search-btn"
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? '검색중...' : '🔍'}
              </button>
              {showSearchResults && (
                  <button
                      className="chat-search-clear"
                      onClick={clearSearch}
                      title="검색 결과 지우기"
                  >
                    ✕
                  </button>
              )}
            </div>
            <div className="chat-messages" ref={chatRef}>
              {showSearchResults ? (
                  /* 검색 결과 표시 */
                  <>
                    <div className="search-results-header">
                      검색 결과: "{searchQuery}" ({searchResults.length}건)
                    </div>
                    {searchResults.length > 0 ? (
                        searchResults.map((msg) => (
                            <div key={msg.id}
                                 className={`chat-message search-result ${msg.type
                                 === 'ALERT' ? 'alert-message' : ''}`}>
                              <div className="chat-user">{msg.user}</div>
                              <div className="chat-text">{msg.text}</div>
                              <div className="chat-time">{msg.time}</div>
                            </div>
                        ))
                    ) : (
                        <div className="no-search-results">
                          검색 결과가 없습니다.
                        </div>
                    )}
                  </>
              ) : (
                  /* 일반 채팅 메시지 표시 */
                  <>
                    {hasMore && (
                        <div ref={loadMoreRef} className="load-more-trigger">
                          {loading && <div className="loading-message">이전 메시지를
                            불러오는 중...</div>}
                        </div>
                    )}
                    {!hasMore && chatList.length > 0 && (
                        <div className="chat-end-message">채팅의 시작입니다.</div>
                    )}
                    {chatList.map((msg) => (
                        <div key={msg.id}
                             className={`chat-message ${msg.type === 'ALERT'
                                 ? 'alert-message' : ''}`}>
                          <div className="chat-user">{msg.user}</div>
                          <div className="chat-text">{msg.text}</div>
                          <div className="chat-time">{msg.time}</div>
                        </div>
                    ))}
                  </>
              )}
            </div>
            <div className="chat-input-container">
              <input
                  type="text"
                  className="chat-input"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={(e) => {
                    // 조합
                    // 종료 시 최종 텍스트 반영(안전)
                    setMessage(e.currentTarget.value);
                    setIsComposing(false);
                  }}
                  onKeyDown={(e) => {
                    // 브라우저별 안전 가드: 로컬 state || native flag 둘 다 확인
                    const composing = isComposing || e.nativeEvent.isComposing;
                    if (e.key === 'Enter' && !e.shiftKey) {
                      if (composing) {
                        return;
                      }       // ⬅️ 조합 중이면 전송 금지
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={isConnected ? "메시지를 입력하세요..." : "연결 중..."}
                  disabled={!isConnected}
              />
              <button
                  className="chat-send"
                  onClick={handleSendMessage}
                  disabled={!isConnected || !message.trim()}
              >
                전송
              </button>
            </div>
          </div>
        </div>
      </>
  );
}