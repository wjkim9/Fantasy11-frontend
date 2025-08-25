// src/pages/Draft.jsx
window.global = window;
import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Draft.css';
import { useNavigate, useParams } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useInView } from 'react-intersection-observer';
import debounce from 'lodash.debounce';
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

// WebSocket URL 처리 (로컬/배포 환경 대응)
const getWebSocketUrl = () => {
    const wsUrl = import.meta.env.VITE_API_WS_URL || 'ws://localhost:8080';

    // 배포 환경에서는 wss://가 설정되어 있을 것이므로 그대로 사용
    // 로컬 환경에서는 ws://를 http://로 변환
    return wsUrl
    .replace(/\/$/, '')
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://');
};

const SOCKJS_ORIGIN = getWebSocketUrl();

export default function Draft() {
    const [draftTime, setDraftTime] = useState(60); // 1. 45초 -> 60초로 변경
    const [myPlayerCount, setMyPlayerCount] = useState(2);

    // 채팅 관련 상태 (ChatRoom.jsx 패턴 적용)
    const [chatList, setChatList] = useState([]);
    const [message, setMessage] = useState('');
    const [isComposing, setIsComposing] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [chatRoomId, setChatRoomId] = useState(null); // Draft용 채팅방 ID

    // 채팅 검색 관련 상태
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);

    // 채팅 히스토리 무한스크롤 관련 상태
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [nextCursor, setNextCursor] = useState(null);
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    // 읽음 표시 관련 상태
    const [lastReadMessageId, setLastReadMessageId] = useState(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [players, setPlayers] = useState([]); // 백엔드에서 받아온 선수 데이터
    const [playersLoading, setPlayersLoading] = useState(true); // 선수 데이터 로딩 상태
    const [error, setError] = useState(null); // 에러 상태
    const [elementTypes, setElementTypes] = useState([]); // 포지션 타입 데이터
    const [searchParams, setSearchParams] = useState({
        keyword: '',
        elementTypeId: ''
    }); // 검색 파라미터

    // 새로 추가된 상태들
    const [participants, setParticipants] = useState([]); // 드래프트 참가자 목록
    const [participantLoading, setParticipantLoading] = useState(true);
    const [participantError, setParticipantError] = useState(null);
    const [countdown, setCountdown] = useState(10); // 드래프트 시작 카운트다운
    const [showCountdown, setShowCountdown] = useState(false); // 카운트다운 표시 여부
    const [draftStarted, setDraftStarted] = useState(false); // 드래프트 시작 여부
    const [currentTurnIndex, setCurrentTurnIndex] = useState(0); // 현재 턴 인덱스
    const [turnTimer, setTurnTimer] = useState(null); // 턴 타이머

    // 드래프트 관련 새로운 상태들
    const [participantPickCounts, setParticipantPickCounts] = useState({}); // 각 참가자별 선택한 선수 수
    const [draftCompleted, setDraftCompleted] = useState(false); // 드래프트 완료 여부
    const [showWarningMessage, setShowWarningMessage] = useState(false); // 경고 메시지 표시 여부
    const [isSelectingPlayer, setIsSelectingPlayer] = useState(false); // 선수 선택 중인지 여부
    const [botAutoSelectTimer, setBotAutoSelectTimer] = useState(null); // Bot 자동 선택 타이머
    const [selectedPlayerIds, setSelectedPlayerIds] = useState([]); // 이미 선택된 선수 ID 목록
    const [isTimerPaused, setIsTimerPaused] = useState(false); // 타이머 일시정지 상태

    // 드래프트된 선수 관련 상태들
    const [draftedPlayers, setDraftedPlayers] = useState([]); // 드래프트된 선수 전체 리스트
    const [selectedParticipantId, setSelectedParticipantId] = useState(null); // 선택된 참가자 ID
    const [draftedPlayersLoading, setDraftedPlayersLoading] = useState(false); // 드래프트된 선수 로딩 상태
    const [draftedPlayersError, setDraftedPlayersError] = useState(null); // 드래프트된 선수 에러 상태

    // 3. 선수 선택 알림 메시지 상태 추가
    const [playerSelectMessage, setPlayerSelectMessage] = useState('');
    const [showPlayerSelectMessage, setShowPlayerSelectMessage] = useState(
        false);

    // 2. 스네이크 드래프트 관련 상태 추가
    const [currentRound, setCurrentRound] = useState(1); // 현재 라운드
    const [isReverseRound, setIsReverseRound] = useState(false); // 역순 라운드 여부
    
    // 새로 추가된 상태들 - 턴 시작 요청 관련
    const [turnRequestSent, setTurnRequestSent] = useState(false); // 턴 시작 요청이 보내졌는지 여부
    
    const chatBoxRef = useRef(null);
    const navigate = useNavigate();
    const {draftId} = useParams(); // URL에서 draftId 파라미터 가져오기
    const stompClientRef = useRef(null); // 드래프트용 WebSocket
    const chatStompClientRef = useRef(null); // 채팅용 WebSocket
    const autoSelectTimeoutRef = useRef(null);
    const retryTimeoutRef = useRef(null);

    // 채팅 무한스크롤 관련 ref
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
            const response = await axiosInstance.get('/api/user/me');
            console.log('사용자 정보 응답:', response.data);
            // API는 UserMeResponse(id, email, name) 구조
            setCurrentUser({
                id: response.data.id,
                email: response.data.email,
                name: response.data.name
            });
        } catch (error) {
            console.error('사용자 정보 로드 실패:', error.response?.data);
            // 임시 사용자 정보 설정
            setCurrentUser({
                id: localStorage.getItem('userId') || 'test-user',
                email: localStorage.getItem('userEmail') || 'test@gmail.com',
                name: localStorage.getItem('userName') || 'Test User'
            });
        }
    };

    // 드래프트 기반 채팅방 생성 및 연결
    const createOrGetChatRoom = async () => {
        try {
            // 먼저 기존 채팅방이 있는지 확인
            const getChatRoomResponse = await axiosInstance.get(
                `/api/chat-rooms/by-draft/${draftId}`);
            console.log('채팅방 조회 응답:', getChatRoomResponse.data);

            // API는 ChatRoom 객체를 직접 반환하므로 .id 사용
            const roomId = getChatRoomResponse.data.id;
            setChatRoomId(roomId);
            console.log('기존 채팅방 연결:', roomId);
            return roomId;
        } catch (error) {
            console.log('채팅방 조회 실패:', error.response?.status,
                error.response?.data);
            // 404 오류인 경우 새로 생성
            if (error.response?.status === 404) {
                try {
                    const createResponse = await axiosInstance.post(
                        '/api/chat-rooms', {
                            draftId: draftId
                        });
                    console.log('채팅방 생성 응답:', createResponse.data);

                    // API는 ChatRoom 객체를 직접 반환하므로 .id 사용
                    const roomId = createResponse.data.id;
                    setChatRoomId(roomId);
                    console.log('새로운 채팅방 생성:', roomId);
                    return roomId;
                } catch (createError) {
                    console.error('채팅방 생성 실패:', createError.response?.data);
                    return null;
                }
            } else {
                console.error('채팅방 조회 실패:', error.response?.data);
                return null;
            }
        }
    };

    // 시간 포맷 (채팅에서 사용)
    const normalizeIsoToMs = (ts) => {
        if (!ts) return null;
        if (ts instanceof Date || typeof ts === 'number') return ts;
        if (typeof ts === 'string') {
            return ts.replace(
                /(\.[0-9]{3})[0-9]+(Z|[+\-][0-9]{2}:[0-9]{2})$/, '$1$2');
        }
        return ts;
    };

    const formatTime = (timestamp) => {
        const safe = normalizeIsoToMs(timestamp);
        const date = safe ? new Date(safe) : new Date();
        if (isNaN(date)) return '';
        try {
            return date.toLocaleTimeString('ko-KR', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return '';
        }
    };

    // 메시지 포맷 변환
    const formatMessage = useCallback((item) => {
        let userName = '시스템';
        if (item.type === 'ALERT' || item.type === 'SYSTEM') {
            userName = '⚽ 알림';
        } else if (item.userId) {
            if (currentUser && item.userId === currentUser.id) {
                userName = currentUser.email;
            } else {
                // 참가자 리스트에서 사용자 정보 찾기 (추후 수정 가능)
                userName = item.userEmail || '알 수 없는 사용자';
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
    }, [currentUser]);

    // draftId 확인을 위한 로그
    useEffect(() => {
        console.log('Current draftId from URL:', draftId);
        if (!draftId) {
            console.error('draftId is missing from URL parameters');
        }
    }, [draftId]);

    // 새로고침 방지 및 창 닫기 확인 기능
    useEffect(() => {
        // 새로고침 방지 (F5, Ctrl+R 등)
        const handleKeyDown = (e) => {
            // F5 키 방지
            if (e.key === 'F5') {
                e.preventDefault();
                alert('드래프트 중 새로고침은 불가합니다.');
                return false;
            }

            // Ctrl+R (새로고침) 방지
            if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
                e.preventDefault();
                alert('드래프트 중 새로고침은 불가합니다.');
                return false;
            }
        };

        // beforeunload 이벤트로 창 닫기/새로고침 시도 감지
        const handleBeforeUnload = (e) => {
            const message = '정말로 창 닫기 하시겠습니까? 해당 드래프트방에 다시 돌아올 수 없습니다.';
            e.preventDefault();
            e.returnValue = message; // Chrome에서 필요
            return message; // 다른 브라우저에서 필요
        };

        // 이벤트 리스너 등록
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('beforeunload', handleBeforeUnload);

        // 컴포넌트 언마운트 시 이벤트 리스너 제거
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // Bot 판별 함수
    const isBot = (participant) => {
        return participant.userFlag === false &&
            (participant.userName === null || participant.userName.trim()
                === "");
    };

    // 2. 스네이크 드래프트 순서 계산 함수 (수정됨)
    const getSnakeDraftTurnIndex = (totalSelections, participantCount) => {
        // 현재 라운드 계산 (0부터 시작)
        const currentRound = Math.floor(totalSelections / participantCount);
        // 현재 라운드 내에서의 위치 (0부터 시작)
        const positionInRound = totalSelections % participantCount;
        
        console.log(`Snake draft calculation: totalSelections=${totalSelections}, participantCount=${participantCount}, currentRound=${currentRound}, positionInRound=${positionInRound}`);
        
        let userNumber;
        // 짝수 라운드(0, 2, 4...)는 정순 (1, 2, 3, 4)
        // 홀수 라운드(1, 3, 5...)는 역순 (4, 3, 2, 1)
        if (currentRound % 2 === 0) {
            // 정순: userNumber 1, 2, 3, 4
            userNumber = positionInRound + 1;
        } else {
            // 역순: userNumber 4, 3, 2, 1
            userNumber = participantCount - positionInRound;
        }
        
        // userNumber에 해당하는 참가자의 인덱스 찾기
        const turnIndex = participants.findIndex(participant => participant.participantUserNumber === userNumber);
        
        console.log(`Snake draft result: userNumber=${userNumber}, turnIndex=${turnIndex}, round=${currentRound + 1}`);
        return turnIndex;
    };

    // currentParticipantId를 찾는 함수 (data-participant-user-number가 1인 참가자의 data-participant-id)
    const getCurrentParticipantId = () => {
        const firstParticipant = participants.find(participant => participant.participantUserNumber === 1);
        return firstParticipant ? firstParticipant.participantId : null;
    };

    // 턴 시작 요청 함수
    const sendTurnStartRequest = async () => {
        if (turnRequestSent) return;
        
        const currentParticipantId = getCurrentParticipantId();
        if (!currentParticipantId) {
            console.error('Cannot find currentParticipantId (participant with userNumber 1)');
            return;
        }

        try {
            setTurnRequestSent(true);
            
            console.log('Sending turn start request with currentParticipantId:', currentParticipantId);

            const accessToken = localStorage.getItem("accessToken");
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/draft/${draftId}/turn`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    currentParticipantId: currentParticipantId,
                    roundNo: 1
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            console.log('Turn start request sent successfully');
            
            // 요청 성공 후 바로 드래프트 시작
            setDraftStarted(true);

        } catch (err) {
            console.error("턴 시작 요청 실패:", err);
            setTurnRequestSent(false);
            // 실패 시에도 드래프트 시작
            setDraftStarted(true);
        }
    };

    // participantId로 참가자 인덱스를 찾는 함수
    const findParticipantIndexById = (participantId) => {
        return participants.findIndex(participant => participant.participantId === participantId);
    };

    // 현재 사용자의 차례인지 확인하는 함수
    const isMyTurn = () => {
        if (!draftStarted || draftCompleted || participants.length
            === 0) return false;

        const currentParticipant = participants[currentTurnIndex];
        if (!currentParticipant) return false;

        // Bot이 아니고 userFlag가 true인 경우 사용자의 차례
        return !isBot(currentParticipant) && currentParticipant.userFlag
            === true;
    };

    // 포지션 코드 변환 함수
    const getPositionCodeFromPluralName = (elementTypePluralName) => {
        switch (elementTypePluralName) {
            case 'Forwards':
                return 'FW';
            case 'Midfielders':
                return 'MF';
            case 'Defenders':
                return 'DF';
            case 'Goalkeepers':
                return 'GK';
            default:
                return '';
        }
    };

    // 현재 턴 참가자의 포지션별 선택된 선수 수 체크 함수
    const checkPositionLimit = (selectedPlayer) => {
        const currentParticipant = participants[currentTurnIndex];
        if (!currentParticipant) return {
            isValid: false,
            message: '참가자 정보를 찾을 수 없습니다.'
        };

        // 현재 참가자가 선택한 선수들 필터링
        const currentParticipantDraftedPlayers = draftedPlayers.filter(
            player => player.participantId
                === currentParticipant.participantId
        );

        // 현재 선택하려는 포지션과 같은 포지션의 선수들 필터링
        const samePositionPlayers = currentParticipantDraftedPlayers.filter(
            player => player.elementTypeId === selectedPlayer.elementTypeId
        );

        // 해당 포지션의 최대 선택 가능 수 찾기
        const elementType = elementTypes.find(
            type => type.id === selectedPlayer.elementTypeId
        );

        if (!elementType) {
            return {isValid: false, message: '포지션 정보를 찾을 수 없습니다.'};
        }

        const maxPlayCount = elementType.squadMaxPlay;
        const currentCount = samePositionPlayers.length;

        console.log(
            `Position check for ${selectedPlayer.elementTypePluralName}:`, {
                currentCount,
                maxPlayCount,
                elementTypeId: selectedPlayer.elementTypeId,
                participantId: currentParticipant.participantId
            });

        if (currentCount >= maxPlayCount) {
            return {
                isValid: false,
                message: `${selectedPlayer.elementTypePluralName} 포지션은 최대 ${maxPlayCount}명까지 선택할 수 있습니다.`
            };
        }

        return {isValid: true, message: ''};
    };

    // 드래프트된 선수 리스트 fetch
    useEffect(() => {
        const fetchDraftedPlayers = async () => {
            try {
                setDraftedPlayersLoading(true);

                const accessToken = localStorage.getItem("accessToken");

                const response = await axiosInstance.get(
                    `/api/draft/${draftId}/allPlayers`);

                const draftedPlayersData = response.data;
                setDraftedPlayers(draftedPlayersData);

                // 드래프트된 선수 ID들을 selectedPlayerIds에 추가
                const playerIds = draftedPlayersData.map(
                    player => player.playerId);
                setSelectedPlayerIds(playerIds);

                setDraftedPlayersError(null);

                console.log('Drafted players loaded:',
                    draftedPlayersData.length, 'players');

            } catch (err) {
                console.error("드래프트된 선수 데이터를 가져오는데 실패했습니다:", err);
                setDraftedPlayersError(err.message);
            } finally {
                setDraftedPlayersLoading(false);
            }
        };

        fetchDraftedPlayers();
    }, [draftId]);

    // 참가자 카드 클릭 핸들러
    const handleParticipantCardClick = (participantId) => {
        setSelectedParticipantId(participantId);
        console.log('Selected participant:', participantId);
    };

    // 선택된 참가자의 드래프트된 선수들 가져오기
    const getSelectedParticipantDraftedPlayers = () => {
        if (!selectedParticipantId) return [];

        return draftedPlayers.filter(
            player => player.participantId === selectedParticipantId);
    };

    // 참가자 데이터 fetch (수정됨)
    useEffect(() => {
        const fetchParticipants = async () => {
            try {
                setParticipantLoading(true);

                const accessToken = localStorage.getItem("accessToken");

                const response = await axiosInstance.get(
                    `/api/draft/${draftId}/participants`);

                const participantData = response.data;

                // participantUserNumber로 정렬
                const sortedParticipants = participantData.sort(
                    (a, b) => a.participantUserNumber
                        - b.participantUserNumber
                );

                setParticipants(sortedParticipants);

                // 각 참가자별 선택 카운트 초기화
                const initialCounts = {};
                sortedParticipants.forEach(participant => {
                    initialCounts[participant.participantId] = 0;
                });
                setParticipantPickCounts(initialCounts);

                setParticipantError(null);

                // 참가자 정보 로그 출력

                console.log('Participants loaded:', sortedParticipants.map(p => ({
                    id: p.participantId,
                    userFlag: p.userFlag,
                    userName: p.userName,
                    userNumber: p.participantUserNumber,
                    isBot: isBot(p)
                })));

            } catch (err) {
                console.error("참가자 데이터를 가져오는데 실패했습니다:", err);
                setParticipantError(err.message);
            } finally {
                setParticipantLoading(false);
            }
        };

        fetchParticipants();
    }, [draftId]);

    // 참가자 데이터가 완전히 로드된 후 턴 시작 요청 전송
    useEffect(() => {
        if (!participantLoading && participants.length > 0 && !turnRequestSent) {
            console.log('Participants fully loaded, sending turn start request');
            sendTurnStartRequest();
        }
    }, [participantLoading, participants, turnRequestSent]);

    // 드래프트 완료 체크 함수
    const checkDraftCompletion = (updatedPickCounts) => {
        console.log('Checking draft completion with counts:',
            updatedPickCounts);
        console.log('Participants:', participants);

        if (participants.length === 0) return false;

        // 모든 참가자가 11명씩 선택했는지 확인
        const allCompleted = participants.every(participant => {
            const pickCount = updatedPickCounts[participant.participantId]
                || 0;
            console.log(
                `Participant ${participant.participantId} (${participant.userName}): ${pickCount}/11`);
            return pickCount >= 11;
        });

        console.log('All participants completed:', allCompleted);
        return allCompleted;
    };

    // 4. 드래프트 완료 후 채팅방으로 리다이렉트 하는 함수
    const handleDraftCompletion = async () => {
        try {
            const accessToken = localStorage.getItem("accessToken");

            const params = new URLSearchParams({draftId: draftId});

            const response = await axiosInstance.get(
                `/api/chat-rooms/getChatroomId?${params.toString()}`);

            const chatRoomData = response.data;

            // roomId를 이용해서 채팅방으로 리다이렉트
            navigate(`/chatroom/${chatRoomData.roomId}`);

        } catch (err) {
            console.error("채팅방 정보를 가져오는데 실패했습니다:", err);
            // 실패 시 기본 메시지 표시
            alert('드래프트가 완료되었습니다.');
        }
    };

    // 선택 가능한 선수 목록 가져오기
    const getSelectablePlayers = () => {
        return players.filter(player =>
            isPlayerSelectable(player.status) &&
            !selectedPlayerIds.includes(player.id)
        );
    };

    // Bot 자동 선택 함수
    const performBotAutoSelect = () => {
        const currentParticipant = participants[currentTurnIndex];
        if (!currentParticipant || !isBot(currentParticipant)) return;

        console.log(
            `Bot ${currentParticipant.participantId} is auto-selecting...`);

        const selectablePlayers = getSelectablePlayers();
        if (selectablePlayers.length === 0) {
            console.log('No selectable players available for bot');
            moveToNextTurn();
            return;
        }

        // Bot은 포지션 제한을 고려하여 선택
        let availablePlayer = null;
        for (const player of selectablePlayers) {
            const positionCheck = checkPositionLimit(player);
            if (positionCheck.isValid) {
                availablePlayer = player;
                break;
            }
        }

        if (!availablePlayer) {
            console.log(
                'No available players within position limits for bot');
            moveToNextTurn();
            return;
        }

        console.log(`Bot selecting player: ${availablePlayer.name}`);
        handlePlayerSelect(availablePlayer, true, true); // isAutoSelect, isBot
    };

    // 사용자 시간 만료 시 자동 선택 함수 (수정됨)
    const performUserAutoSelect = () => {
        const currentParticipant = participants[currentTurnIndex];
        if (!currentParticipant || isBot(currentParticipant)) return;

        // 현재 참가자가 실제 사용자(data-is-user가 true)가 아닌 경우 아무것도 하지 않음
        /* 서버에서 체크할 거라 주석처리
        if (currentParticipant.userFlag !== true) {
            console.log(
                `Not a real user (userFlag: ${currentParticipant.userFlag}), waiting for WebSocket response...`);
            return; // 대기 상태 유지, 다음 턴으로 이동하지 않음, 자동 선택하지 않음
        }

        */

        console.log(`User ${currentParticipant.participantId} time expired, sending random select request...`);
        
        // 실제 사용자인 경우 랜덤 선택 WebSocket 통신 전송
        if (!stompClientRef.current || !stompClientRef.current.connected) {
            console.error('WebSocket not connected for random select');
            return;
        }

        // 랜덤 선택 요청 데이터 구성
        const randomSelectData = {
            draftId: draftId,
            roundNo: currentRound
        };

        console.log('Sending random player selection request:',
            randomSelectData);

        // WebSocket으로 랜덤 선택 요청 전송
        stompClientRef.current.publish({
            destination: '/app/draft/selectRandomPlayer',
            body: JSON.stringify(randomSelectData)
        });
    };

    // 시간 만료 시 처리 함수 (수정됨)
    const handleTimeExpired = () => {
        const currentParticipant = participants[currentTurnIndex];

        // 현재 참가자가 실제 사용자(data-is-user가 true)인 경우에만 자동 선택
        if (currentParticipant && !isBot(currentParticipant)
            && currentParticipant.userFlag === true && !isSelectingPlayer) {
            performUserAutoSelect();
            return;
        }

        // 그 외의 경우 (Bot이거나 data-is-user가 false인 다른 사용자) - 타이머 일시정지
        console.log(
            `Time expired for participant ${currentParticipant?.participantId}, pausing timer and waiting for WebSocket response...`);
        setIsTimerPaused(true);
        setDraftTime(0);
        return;
    };

    // 2. 다음 턴으로 이동 (스네이크 드래프트 적용) (수정됨)
    const moveToNextTurn = () => {
        if (draftCompleted) return;

        console.log('Moving to next turn...');

        // 타이머 일시정지 해제
        setIsTimerPaused(false);

        // 타이머들 정리
        if (botAutoSelectTimer) {
            clearTimeout(botAutoSelectTimer);
            setBotAutoSelectTimer(null);
        }
        if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
        }
        if (turnTimer) {
            clearInterval(turnTimer);
            setTurnTimer(null);
        }

        // 현재 상태의 participantPickCounts를 사용하여 총 선택 수 계산
        setParticipantPickCounts(currentCounts => {

            const totalSelections = Object.values(currentCounts).reduce((sum, count) => sum + count, 0);
            console.log(`Current total selections: ${totalSelections}`);
            
            // 다음 턴 인덱스 계산
            const nextTurnIndex = getSnakeDraftTurnIndex(totalSelections, participants.length);
            
            // 현재 라운드 계산 업데이트 (1부터 시작하는 라운드 번호)
            const newRound = Math.floor(totalSelections / participants.length) + 1;

            setCurrentRound(newRound);
            setIsReverseRound(newRound % 2 === 0);

            setCurrentTurnIndex(nextTurnIndex);
            setDraftTime(60); // 새로운 턴 시작시 60초로 리셋
            console.log(
                `Turn moved to ${nextTurnIndex} using snake draft (round: ${newRound}, totalSelections: ${totalSelections})`);

            return currentCounts; // 카운트는 변경하지 않음
        });
    };

    // 드래프트 턴 시스템 (수정됨)
    useEffect(() => {
        if (!draftStarted || participants.length === 0
            || draftCompleted) return;

        // 첫 번째 턴 설정 - 드래프트 시작시에만 0으로 설정
        setCurrentTurnIndex(0);
        setDraftTime(60); // 1. 45초 -> 60초로 변경

        console.log(`Initial turn set to: 0 (first participant)`);

        const startTurnTimer = () => {
            const timer = setInterval(() => {
                setDraftTime(prev => {
                    // 타이머가 일시정지된 경우 카운트다운 멈춤
                    if (isTimerPaused) {
                        return prev;
                    }

                    if (prev <= 1) {
                        // 시간 만료 처리
                        handleTimeExpired();

                        // 현재 참가자 확인
                        const currentParticipant = participants[currentTurnIndex];

                        // 실제 사용자(data-is-user가 true)인 경우에만 60초로 리셋
                        if (currentParticipant &&
                            !isBot(currentParticipant) &&
                            currentParticipant.userFlag === true) {
                            return 60; // 1. 45초 -> 60초로 변경
                        }

                        // Bot이거나 data-is-user가 false인 경우 0으로 유지
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
            return timer;
        };

        const timer = startTurnTimer();
        setTurnTimer(timer);

        return () => {
            if (timer) clearInterval(timer);
        };
    }, [draftStarted, participants.length, draftCompleted]);

    // 턴 시작 시 Bot 체크 (수정됨 - Bot 자동 선택 제거)
    useEffect(() => {
        if (!draftStarted || draftCompleted || participants.length
            === 0) return;

        const currentParticipant = participants[currentTurnIndex];
        if (!currentParticipant) return;

        console.log(`Turn ${currentTurnIndex}: Participant`, {
            id: currentParticipant.participantId,
            userFlag: currentParticipant.userFlag,
            userName: currentParticipant.userName,
            isBot: isBot(currentParticipant)
        });

        // Bot 자동 선택 로직 제거 - Bot도 WebSocket 응답만 기다림

        return () => {
            if (botAutoSelectTimer) {
                clearTimeout(botAutoSelectTimer);
                setBotAutoSelectTimer(null);
            }
        };
    }, [currentTurnIndex, draftStarted, draftCompleted, participants]);

    // 턴 변경 시 타이머 리셋 (수정됨)
    useEffect(() => {
        if (!draftStarted || draftCompleted) return;

        // 타이머 일시정지 해제
        setIsTimerPaused(false);

        if (turnTimer) {
            clearInterval(turnTimer);
        }

        const newTimer = setInterval(() => {
            setDraftTime(prev => {
                // 타이머가 일시정지된 경우 카운트다운 멈춤
                if (isTimerPaused) {
                    return prev;
                }

                if (prev <= 1) {
                    handleTimeExpired();

                    // 현재 참가자 확인
                    const currentParticipant = participants[currentTurnIndex];

                    // 실제 사용자(data-is-user가 true)인 경우에만 60초로 리셋
                    if (currentParticipant &&
                        !isBot(currentParticipant) &&
                        currentParticipant.userFlag === true) {
                        return 60; // 1. 45초 -> 60초로 변경
                    }

                    // Bot이거나 data-is-user가 false인 경우 0으로 유지
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        setTurnTimer(newTimer);

        return () => {
            if (newTimer) clearInterval(newTimer);
        };
    }, [currentTurnIndex, draftStarted, draftCompleted]);

    // WebSocket 연결 설정 (수정됨)
    useEffect(() => {
        const connectWebSocket = () => {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                console.error("WebSocket 연결 실패: 토큰이 없음");
                return;
            }

            const socket = new SockJS(
                `${SOCKJS_ORIGIN}/ws-draft?token=Bearer ${encodeURIComponent(
                    token)}`);
            const stompClient = new Client({
                webSocketFactory: () => socket,
                debug: (str) => {
                    console.log('STOMP Debug: ', str);
                },
                onConnect: (frame) => {
                    console.log('Connected: ' + frame);
                    console.log(`topic/draft is  ${draftId}`);

                    // 드래프트 토픽 구독
                    stompClient.subscribe(`/topic/draft.${draftId}`, (message) => {
                        const draftResponse = JSON.parse(message.body);
                        console.log('Received draft message:', draftResponse);
                        
                        setIsSelectingPlayer(false); // 선수 선택 완료
                        
                        // draftCnt 체크 - 44 이상이면 드래프트 완료
                        if (draftResponse.draftCnt >= 44) {
                            console.log('Draft completed! draftCnt:', draftResponse.draftCnt);
                            setDraftCompleted(true);
                            if (turnTimer) {
                                clearInterval(turnTimer);
                                setTurnTimer(null);
                            }
                            handleDraftCompletion();
                            return;
                        }
                        
                        // draftCnt < 44인 경우 (아직 드래프트 중) nextUserNumber로 턴 변경
                        if (draftResponse.draftCnt < 44 && draftResponse.nextUserNumber) {
                            console.log('Draft continuing, changing turn to nextUserNumber:', draftResponse.nextUserNumber);
                            const nextTurnIndex = participants.findIndex(
                                participant => participant.participantUserNumber === draftResponse.nextUserNumber
                            );
                            if (nextTurnIndex !== -1) {
                                setCurrentTurnIndex(nextTurnIndex);
                                setDraftTime(60); // 60초로 리셋
                                setIsTimerPaused(false);
                                console.log(`Turn moved to index ${nextTurnIndex} (userNumber: ${draftResponse.nextUserNumber})`);
                            }
                        }
                        
                        // isCurrentParticipant나 currentParticipant가 false인 경우 처리 (추가됨)
                        const isCurrentParticipant = draftResponse.isCurrentParticipant !== undefined 
                            ? draftResponse.isCurrentParticipant 
                            : draftResponse.currentParticipant;
                        
                        if (isCurrentParticipant === false) {
                            console.log('Not current participant turn');
                            
                            // participantId와 data-participant-id가 일치하고 data-user-flag가 true인 클라이언트에만 메시지 표시
                            if (draftResponse.participantId) {
                                // 현재 클라이언트의 참가자 정보 찾기
                                const currentClientParticipant = participants.find(p => 
                                    p.participantId === draftResponse.participantId && p.userFlag === true
                                );
                                
                                if (currentClientParticipant) {
                                    console.log('Showing warning message to participant:', draftResponse.participantId);
                                    // '현재 다른 참가자의 차례입니다.' 메시지 2초 표시
                                    setShowWarningMessage(true);
                                    setTimeout(() => {
                                        setShowWarningMessage(false);
                                    }, 2000);
                                }
                            }
                            
                            return; // 다른 처리는 하지 않고 리턴
                        }
                        
                        // alreadySelected에 따른 처리
                        if (draftResponse.alreadySelected) {
                            console.log('Player already selected, retrying...');
                            
                            const currentParticipant = participants[currentTurnIndex];
                            
                            // Bot인 경우 다시 시도 (Bot 자동 선택 제거)
                            if (currentParticipant && isBot(currentParticipant)) {
                                console.log('Bot retrying selection - but auto selection removed, waiting for WebSocket...');
                                // Bot 자동 선택 로직 제거 - WebSocket 응답만 기다림
                            } else {
                                // 현재 사용자가 실제 요청을 보낸 경우에만 알림 표시 (userFlag가 true인 경우)
                                if (currentParticipant && currentParticipant.userFlag === true) {
                                    alert('이미 선택 된 선수입니다. 다시 선택해 주시기 바랍니다.');
                                }
                                
                                // data-is-user가 false인 다른 사용자의 경우 타이머를 60초로 재시작
                                if (currentParticipant && !isBot(currentParticipant) && currentParticipant.userFlag !== true) {
                                    setDraftTime(60); // 1. 45초 -> 60초로 변경
                                }
                            }
                        } else {
                            console.log('Player selection successful');
                            
                            // 3. 선수 선택 성공 알림 메시지 표시
                            const playerName = draftResponse.playerKrName && draftResponse.playerKrName.trim() !== '' 
                                ? draftResponse.playerKrName 
                                : draftResponse.playerWebName;
                            const userName = draftResponse.userName || '참가자';
                            
                            setPlayerSelectMessage(`${userName}님께서 ${playerName}를 선택하셨습니다.`);
                            setShowPlayerSelectMessage(true);
                            
                            // 1초 후 메시지 숨기기
                            setTimeout(() => {
                                setShowPlayerSelectMessage(false);
                            }, 1000);
                            
                            // 성공적으로 선택된 경우 선수 ID 추가
                            if (draftResponse.playerId) {
                                setSelectedPlayerIds(prev => [...prev, draftResponse.playerId]);
                                
                                // 드래프트된 선수 리스트에도 추가
                                setDraftedPlayers(prev => [...prev, draftResponse]);
                            }
                            
                            // 현재 참가자의 선택 카운트 증가
                            const currentParticipant = participants[currentTurnIndex];
                            if (currentParticipant) {
                                setParticipantPickCounts(prev => {
                                    const updatedCounts = {
                                        ...prev,
                                        [currentParticipant.participantId]: (prev[currentParticipant.participantId] || 0) + 1
                                    };
                                    
                                    console.log('Updated pick counts:', updatedCounts);
                                    return updatedCounts;
                                });
                                
                                // 사용자인 경우 myPlayerCount 증가
                                if (!isBot(currentParticipant)) {
                                    setMyPlayerCount(prev => prev + 1);
                                }

                                // 드래프트가 완료되지 않은 경우에만 다음 턴으로 이동
                                setTimeout(() => {
                                    setParticipantPickCounts(
                                        currentCounts => {
                                            const isCompleted = checkDraftCompletion(
                                                currentCounts);
                                            if (!isCompleted) {
                                                moveToNextTurn();
                                            }
                                            return currentCounts;
                                        });
                                }, 1500);
                            }
                            
                            // nextUserNumber로 다음 턴 이동 (WebSocket 응답 기반)
                            setTimeout(() => {
                                // 모든 경우에 60초 타이머 다시 시작
                                setDraftTime(60);
                                setIsTimerPaused(false);
                                
                                if (draftResponse.nextUserNumber) {
                                    console.log('Moving turn to nextUserNumber:', draftResponse.nextUserNumber);
                                    const nextTurnIndex = participants.findIndex(
                                        participant => participant.participantUserNumber === draftResponse.nextUserNumber
                                    );
                                    if (nextTurnIndex !== -1) {
                                        setCurrentTurnIndex(nextTurnIndex);
                                        console.log(`Turn moved to index ${nextTurnIndex} (userNumber: ${draftResponse.nextUserNumber})`);
                                    } else {
                                        console.error('Cannot find participant with nextUserNumber:', draftResponse.nextUserNumber);
                                    }
                                } else {
                                    console.log('No nextUserNumber in response, keeping current turn');
                                }
                            }, 1500);
                        }
                    });
                },
                onStompError: (frame) => {
                    console.error('Broker reported error: '
                        + frame.headers['message']);
                    console.error('Additional details: ' + frame.body);
                    setIsSelectingPlayer(false);
                },
                onWebSocketError: (error) => {
                    console.error('WebSocket error: ', error);
                    setIsSelectingPlayer(false);
                },
                onDisconnect: () => {
                    console.log('Disconnected');
                    setIsSelectingPlayer(false);
                }
            });

            stompClient.activate();
            stompClientRef.current = stompClient;
        };

        connectWebSocket();

        // 컴포넌트 언마운트 시 연결 해제
        return () => {
            if (stompClientRef.current) {
                stompClientRef.current.deactivate();
            }
        };
    }, [draftId, participants, currentTurnIndex, turnTimer]);

    // ElementType 데이터 fetch
    useEffect(() => {
        const fetchElementTypes = async () => {
            try {
                const response = await axiosInstance.get(
                    '/api/elementType/all');
                const elementTypeData = response.data;
                setElementTypes(elementTypeData);
            } catch (err) {
                console.error('포지션 데이터를 가져오는데 실패했습니다:', err);
            }
        };

        fetchElementTypes();
    }, []);

    // 선수 데이터 fetch
    useEffect(() => {
        const fetchPlayers = async () => {
            try {
                setPlayersLoading(true);
                const response = await axiosInstance.get(
                    '/api/playerCache');
                const playerData = response.data;

                // PlayerDto 데이터를 화면에 표시할 형태로 변환
                const transformedPlayers = playerData.map(player => ({
                    // 화면 표시용 데이터
                    name: player.krName && player.krName.trim() !== ''
                        ? player.krName : player.webName,
                    team: player.teamKrName && player.teamKrName.trim()
                    !== '' ? player.teamKrName : player.teamName,
                    position: getPositionCode(player.elementTypePluralName),
                    pic: player.pic,

                    // hidden 데이터 (화면에는 안 보이지만 저장)
                    id: player.id,
                    webName: player.webName,
                    krName: player.krName,
                    status: player.status,
                    teamName: player.teamName,
                    teamKrName: player.teamKrName,
                    elementTypeId: player.elementTypeId,
                    elementTypePluralName: player.elementTypePluralName,
                    elementTypeKrName: player.elementTypeKrName
                }));

                setPlayers(transformedPlayers);
                setError(null);
            } catch (err) {
                console.error('선수 데이터를 가져오는데 실패했습니다:', err);
                setError(err.message);
            } finally {
                setPlayersLoading(false);
            }
        };

        fetchPlayers();
    }, []);

    // 선수 선택 핸들러 (수정된 부분)
    const handlePlayerSelect = (player, isAutoSelect = false,
        isBotSelect = false) => {
        // 드래프트가 완료된 경우
        if (draftCompleted) {
            return;
        }

        const currentParticipant = participants[currentTurnIndex];
        if (!currentParticipant) return;

        // 자동 선택이나 Bot 선택이 아닌 경우 사용자의 차례인지 확인
        /* 현재 서버에서 처리
        if (!isAutoSelect && !isBotSelect) {
            if (!isMyTurn()) {
                setShowWarningMessage(true);
                setTimeout(() => {
                    setShowWarningMessage(false);
                }, 3000);
                return;
            }
        }
        */

        // 현재 참가자가 Bot이 아닌데 사용자가 선택하려 하는 경우 (기존 로직)
        if (isBot(currentParticipant) && !isAutoSelect && !isBotSelect) {
            setShowWarningMessage(true);
            setTimeout(() => {
                setShowWarningMessage(false);
            }, 3000);
            return;
        }

        // 이미 선수 선택 중인 경우
        if (isSelectingPlayer) {
            return;
        }

        // 포지션 제한 체크 (Bot이 아닌 사용자나 수동 선택인 경우에만)
        if (!isBotSelect && !isAutoSelect) {
            const positionCheck = checkPositionLimit(player);
            if (!positionCheck.isValid) {
                alert(positionCheck.message);
                return;
            }
        }

        if (!stompClientRef.current || !stompClientRef.current.connected) {
            if (!isBotSelect) {
                alert('서버 연결이 끊어졌습니다. 페이지를 새로고침해 주세요.');
            }
            return;
        }

        setIsSelectingPlayer(true);

        // 선수 선택 데이터 구성
        const selectPlayerData = {
            draftId: draftId,
            playerId: player.id,
            playerWebName: player.webName,
            playerKrName: player.krName,
            playerPic: player.pic,
            teamName: player.teamName,
            teamKrName: player.teamKrName,
            elementTypeId: player.elementTypeId,
            elementTypePluralName: player.elementTypePluralName,
            elementTypeKrName: player.elementTypeKrName,
            roundNo: currentRound
        };

        console.log('Sending player selection:', selectPlayerData);

        // WebSocket으로 선수 선택 요청 전송
        stompClientRef.current.publish({
            destination: '/app/draft/selectPlayer',
            body: JSON.stringify(selectPlayerData)
        });
    };

    // 선수 검색 함수
    const handlePlayerSearch = async () => {
        try {
            setPlayersLoading(true);
            const params = new URLSearchParams();

            if (searchParams.keyword.trim() !== '') {
                params.append('keyword', searchParams.keyword.trim());
            }

            if (searchParams.elementTypeId !== '') {
                params.append('elementTypeId', searchParams.elementTypeId);
            }

            const response = await axiosInstance.get(
                `/api/playerEs/search?${params.toString()}`);
            const searchResults = response.data;

            // PlayerEsDocument 데이터를 화면에 표시할 형태로 변환
            const transformedPlayers = searchResults.map(player => ({
                // 화면 표시용 데이터
                name: player.krName && player.krName.trim() !== ''
                    ? player.krName : player.webName,
                team: player.teamKrName && player.teamKrName.trim() !== ''
                    ? player.teamKrName : player.teamName,
                position: getPositionCode(player.elementTypePluralName),
                pic: player.pic,

                // hidden 데이터 (화면에는 안 보이지만 저장)
                id: player.id,
                webName: player.webName,
                krName: player.krName,
                status: player.status,
                teamName: player.teamName,
                teamKrName: player.teamKrName,
                elementTypeId: player.elementTypeId,
                elementTypePluralName: player.elementTypePluralName,
                elementTypeKrName: player.elementTypeKrName
            }));

            setPlayers(transformedPlayers);
            setError(null);
        } catch (err) {
            console.error('검색에 실패했습니다:', err);
            setError(err.message);
        } finally {
            setPlayersLoading(false);
        }
    };

    // 검색 입력값 변경 핸들러
    const handleSearchInputChange = (name, value) => {
        setSearchParams(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // 검색 엔터 키 처리
    const handleSearchKeyPress = (e) => {
        if (e.key === 'Enter') {
            handlePlayerSearch();
        }
    };

    // status에 따른 비활성화 사유 반환
    const getStatusReason = (status) => {
        switch (status) {
            case 'd':
                return '출전 불투명';
            case 'i':
                return '부상';
            case 's':
                return '징계';
            case 'u':
                return '사용불(임대 등)';
            case 'n':
                return '자격 없음(미등록 선수)';
            default:
                return '';
        }
    };

    // 선수 선택 가능 여부 확인
    const isPlayerSelectable = (status) => {
        return status === 'a';
    };

    const getPositionCode = (elementTypePluralName) => {
        switch (elementTypePluralName) {
            case 'Forwards':
                return 'FW';
            case 'Midfielders':
                return 'MF';
            case 'Defenders':
                return 'DF';
            case 'Goalkeepers':
                return 'GK';
            default:
                return '';
        }
    };

    const formatTimerDisplay = (seconds) =>
        `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
            seconds % 60).padStart(2, '0')}`;

    // 채팅 검색 함수
    const searchChatMessages = async (query) => {
        if (!query.trim() || !chatRoomId) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }

        setIsSearching(true);
        try {
            const response = await axiosInstance.get(
                `/api/chat-rooms/${chatRoomId}/search`, {
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

    // 채팅 검색 실행
    const handleChatSearch = () => {
        searchChatMessages(searchQuery);
    };

    // 검색 초기화
    const clearSearch = () => {
        setSearchQuery('');
        setSearchResults([]);
        setShowSearchResults(false);
    };

    // 채팅 히스토리 초기 로드 (최신 메시지부터)
    const loadInitialHistory = async () => {
        if (loading || !chatRoomId) {
            return;
        }
        setLoading(true);

        try {
            const response = await axiosInstance.get(
                `/api/chat-rooms/${chatRoomId}/messages`, {
                    params: {limit: 30}
                });

            const {
                items,
                nextCursor: cursor,
                hasMore: more
            } = response.data;

            setChatList(items.map(formatMessage));
            setNextCursor(cursor);
            setHasMore(more);
            setIsInitialLoad(false);

            // 초기 로드 완료 후 즉시 맨 아래로 스크롤 (애니메이션 없이)
            requestAnimationFrame(() => {
                if (chatBoxRef.current) {
                    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
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
        if (loading || !nextCursor || !hasMore || !chatRoomId) {
            return;
        }
        setLoading(true);

        try {
            const response = await axiosInstance.get(
                `/api/chat-rooms/${chatRoomId}/messages/before`, {
                    params: {
                        cursor: nextCursor,
                        limit: 30
                    }
                });

            const {
                items,
                nextCursor: cursor,
                hasMore: more
            } = response.data;

            const currentScrollHeight = chatBoxRef.current?.scrollHeight
                || 0;

            setChatList(prev => [...items.map(formatMessage), ...prev]);
            setNextCursor(cursor);
            setHasMore(more);

            setTimeout(() => {
                if (chatBoxRef.current) {
                    const newScrollHeight = chatBoxRef.current.scrollHeight;
                    const heightDiff = newScrollHeight
                        - currentScrollHeight;
                    chatBoxRef.current.scrollTop = chatBoxRef.current.scrollTop
                        + heightDiff;
                }
            }, 50);

        } catch (error) {
            console.error('이전 메시지 로드 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    // 채팅 WebSocket 연결
    const connectChatWebSocket = useCallback(() => {
        if (chatStompClientRef.current?.connected || !chatRoomId) {
            return;
        }

        const token = getAuthToken();
        if (!token) {
            console.error('인증 토큰이 없습니다.');
            setIsConnected(false);
            return;
        }

        try {
            const socket = new SockJS(`${SOCKJS_ORIGIN}/ws`);
            const chatStompClient = new Client({
                webSocketFactory: () => socket,
                connectHeaders: {
                    'Authorization': `Bearer ${token}`
                },
                debug: (str) => {
                    console.log('채팅 STOMP:', str);
                },
                onConnect: (frame) => {
                    console.log('채팅 WebSocket 연결 성공:', frame);
                    setIsConnected(true);

                    // 채팅방 구독
                    const subscription = chatStompClient.subscribe(
                        `/topic/chat/${chatRoomId}`, (message) => {
                            const newMessage = JSON.parse(message.body);

                            // 사용자 이름 결정
                            let userName = '시스템';
                            if (newMessage.type === 'ALERT'
                                || newMessage.type === 'SYSTEM') {
                                userName = '⚽ 알림';
                            } else if (newMessage.userId) {
                                if (currentUser && newMessage.userId
                                    === currentUser.id) {
                                    userName = currentUser.email;
                                } else {
                                    userName = newMessage.userEmail
                                        || '알 수 없는 사용자';
                                }
                            }

                            const formattedMessage = {
                                id: newMessage.id || Date.now().toString(),
                                user: userName,
                                text: newMessage.content,
                                time: formatTime(
                                    newMessage.createdAt || new Date()),
                                type: newMessage.type,
                                userId: newMessage.userId
                            };

                            setChatList(prev => {
                                const newList = [...prev, formattedMessage];

                                // 새 메시지 추가 후 즉시 스크롤을 맨 아래로
                                requestAnimationFrame(() => {
                                    if (chatBoxRef.current) {
                                        const scrollElement = chatBoxRef.current;
                                        scrollElement.scrollTop = scrollElement.scrollHeight;
                                    }
                                });

                                return newList;
                            });
                        }, {
                            'Authorization': `Bearer ${token}`
                        });

                    console.log('채팅 구독 완료:', subscription);
                },
                onDisconnect: (frame) => {
                    console.log('채팅 WebSocket 연결 해제:', frame);
                    setIsConnected(false);
                },
                onStompError: (frame) => {
                    console.error('채팅 STOMP 오류:', frame);
                    setIsConnected(false);

                    setTimeout(() => {
                        if (!chatStompClientRef.current?.connected) {
                            console.log('채팅 WebSocket 재연결 시도...');
                            connectChatWebSocket();
                        }
                    }, 3000);
                },
                onWebSocketError: (error) => {
                    console.error('채팅 WebSocket 오류:', error);
                },
                reconnectDelay: 5000,
                heartbeatIncoming: 4000,
                heartbeatOutgoing: 4000
            });

            chatStompClient.activate();
            chatStompClientRef.current = chatStompClient;
            console.log('채팅 STOMP 클라이언트 활성화됨');
        } catch (error) {
            console.error('채팅 WebSocket 연결 실패:', error);
            setIsConnected(false);
        }
    }, [chatRoomId, currentUser]);

    // 메시지 전송
    const handleSendMessage = () => {
        if (isComposing) {
            return;
        }
        if (!message.trim()) {
            return;
        }

        if (!chatStompClientRef.current?.connected) {
            alert('채팅 서버에 연결되지 않았습니다. 잠시 후 다시 시도해주세요.');
            return;
        }

        const messageData = {
            roomId: chatRoomId,
            content: message.trim()
        };

        try {
            chatStompClientRef.current.publish({
                destination: `/app/chat/${chatRoomId}/send`,
                body: JSON.stringify(messageData)
            });
            setMessage('');
        } catch (error) {
            console.error('메시지 전송 실패:', error);
            alert('메시지 전송에 실패했습니다.');
        }
    };

    // 채팅 전송 (기존 이벤트 핸들러 수정)
    const handleSend = () => {
        handleSendMessage();
    };

    // 채팅 엔터 (기존 이벤트 핸들러 수정)
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') handleSend();
    };

    // 무한스크롤 로드 디바운스
    const debouncedLoadMore = useCallback(
        debounce(() => {
            if (hasMore && !loading && !isInitialLoad) {
                loadMoreMessages();
            }
        }, 300),
        [hasMore, loading, nextCursor, isInitialLoad, chatRoomId]
    );

    // 드래프트 나가기
    const handleExit = () => {
        if (window.confirm('정말로 드래프트에서 나가시겠습니까?')) {
            // WebSocket 연결 해제
            if (stompClientRef.current) {
                stompClientRef.current.deactivate();
            }
            if (chatStompClientRef.current) {
                chatStompClientRef.current.deactivate();
            }
            // 타이머들 정리
            if (turnTimer) {
                clearInterval(turnTimer);
            }
            if (autoSelectTimeoutRef.current) {
                clearTimeout(autoSelectTimeoutRef.current);
            }
            if (botAutoSelectTimer) {
                clearTimeout(botAutoSelectTimer);
            }
            if (retryTimeoutRef.current) {
                clearTimeout(retryTimeoutRef.current);
            }
            alert('메인 페이지로 돌아갑니다.');
            navigate('/');
        }
    };

    // 무한스크롤 트리거
    useEffect(() => {
        if (inView && hasMore && !loading && !isInitialLoad) {
            debouncedLoadMore();
        }
    }, [inView, hasMore, loading, isInitialLoad, debouncedLoadMore]);

    // 채팅 방 생성 및 초기화
    useEffect(() => {
        if (draftId && currentUser) {
            createOrGetChatRoom();
        }
    }, [draftId, currentUser]);

    // 채팅방 ID가 설정된 후 채팅 기록 로드
    useEffect(() => {
        if (chatRoomId && currentUser) {
            loadInitialHistory();
        }
    }, [chatRoomId, currentUser]);

    // 사용자 정보 로드
    useEffect(() => {
        fetchCurrentUser();
    }, []);

    // 채팅 WebSocket 연결 (채팅방 ID가 설정된 후)
    useEffect(() => {
        if (chatRoomId && currentUser && !isConnected) {
            connectChatWebSocket();
        }
    }, [chatRoomId, currentUser, connectChatWebSocket]);

    useEffect(() => {
        if (chatBoxRef.current) {
            chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
        }
    }, [chatList]);

    // 채팅 메시지 스크롤 자동 이동
    useEffect(() => {
        if (chatBoxRef.current && chatList.length > 0) {
            const {
                scrollTop,
                scrollHeight,
                clientHeight
            } = chatBoxRef.current;
            const isNearBottom = scrollHeight - scrollTop - clientHeight
                < 100;

            if (isNearBottom) {
                setTimeout(() => {
                    if (chatBoxRef.current) {
                        chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
                    }
                }, 100);
            }
        }
    }, [chatList]);

    // 현재 턴인 참가자 정보 가져오기
    const getCurrentTurnParticipant = () => {
        if (!draftStarted || participants.length === 0
            || draftCompleted) return null;
        return participants[currentTurnIndex];
    };

    const currentTurnParticipant = getCurrentTurnParticipant();
    const selectedParticipantDraftedPlayers = getSelectedParticipantDraftedPlayers();

    return (
        <>
            {/* Hidden draftId value */}
            <div style={{ display: 'none' }} data-draft-id={draftId}></div>
            
            {/* Hidden drafted players data */}
            <div style={{ display: 'none' }} id="drafted-players-data">
                {draftedPlayers.map((player, idx) => (
                    <div key={idx} data-drafted-player={JSON.stringify(player)}></div>
                ))}
            </div>
            
            {/* 드래프트 완료 오버레이 */}
            {draftCompleted && (
                <div className="countdown-overlay">
                    <div className="countdown-content">
                        <h2>드래프트가 완료되었습니다.</h2>
                    </div>
                </div>
            )}
            
            {/* 경고 메시지 오버레이 */}
            {showWarningMessage && (
                <div className="warning-overlay">
                    <div className="warning-content">
                        <p>현재 다른 참가자의 차례입니다.</p>
                    </div>
                </div>
            )}
            
            {/* 3. 선수 선택 알림 메시지 오버레이 */}
            {showPlayerSelectMessage && (
                <div className="player-select-overlay">
                    <div className="player-select-content">
                        <p>{playerSelectMessage}</p>
                    </div>
                </div>
            )}
            
            <header className="header">
                <div className="logo">Fantasy11</div>
                {/* <button className="cancel-btn" onClick={() => navigate('/chatroom')}>
                    👉 채팅방 이동 (개발용)
                </button> */}
                <div className="draft-info">
                    <span>라운드 {currentRound}/11</span>
                    <div className="timer">{formatTimerDisplay(draftTime)}</div>
                    <span>
                        {currentTurnParticipant && (
                            `턴: ${!isBot(currentTurnParticipant) && currentTurnParticipant.userName && currentTurnParticipant.userName.trim() !== "" 
                                ? currentTurnParticipant.userName 
                                : `Bot${currentTurnIndex + 1}`}님`
                        )}
                    </span>
                </div>
                <button className="exit-btn" onClick={handleExit}>나가기</button>
            </header>

            <div className="main-container">
                {/* 채팅 */}
                <div className="section chat-section">
                    <h3 className="section-title">채팅</h3>
                    <div className="chat-messages" ref={chatBoxRef}>
                        {chatList.map((chat, i) => (
                            <div key={i} className="chat-message">
                                <div className="chat-user">{chat.user}</div>
                                <div className="chat-text">{chat.message}</div>
                            </div>
                        ))}
                    </div>
                    <div className="chat-input-container">
                        <input
                            type="text"
                            className="chat-input"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="메시지를 입력하세요..."
                            maxLength={100}
                        />
                        <button className="chat-send" onClick={handleSend}>전송</button>
                    </div>
                </div>

                {/* 선수 선택 */}
                <div className="section player-section">
                    <h3 className="section-title">선수 선택</h3>
                    <div className="search-container">
                        <div className="search-form">
                            <select
                                name="elementTypeId"
                                className="search-select"
                                value={searchParams.elementTypeId}
                                onChange={(e) => handleSearchInputChange('elementTypeId', e.target.value)}
                            >
                                <option value="">선택</option>
                                {elementTypes.map(elementType => (
                                    <option key={elementType.id} value={elementType.id}
                                        data-squad-min-play={elementType.squadMinPlay} 
                                        data-squad-max-play={elementType.squadMaxPlay}
                                    >
                                        {elementType.krName && elementType.krName.trim() !== '' 
                                            ? elementType.krName 
                                            : elementType.pluralName}
                                    </option>
                                ))}
                            </select>
                            <input
                                type="text"
                                name="keyword"
                                className="search-input"
                                placeholder="선수 이름 또는 팀으로 검색..."
                                value={searchParams.keyword}
                                onChange={(e) => handleSearchInputChange('keyword', e.target.value)}
                                onKeyPress={handleSearchKeyPress}
                            />
                            <button
                                type="button"
                                className="search-btn"
                                onClick={handlePlayerSearch}
                            >
                                검색
                            </button>
                        </div>
                    </div>
                    <div className="player-list">
                        {/* 로딩 중일 때 */}
                        {playersLoading && (
                            <div className="loading-message">선수 데이터를 불러오는 중...</div>
                        )}
                        
                        {/* 에러 발생시 */}
                        {error && (
                            <div className="error-message">
                                선수 데이터를 불러오는데 실패했습니다: {error}
                            </div>
                        )}
                        
                        {/* 선수 목록 */}
                        {!playersLoading && !error && players.map((player, idx) => (
                            <div key={player.id || idx} className="player-item">
                                <div className="player-position">{player.position}</div>
                                <div className="player-photo">
                                    {player.pic ? (
                                        <img 
                                            src={player.pic} 
                                            alt={player.name} 
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div className="no-photo">NO IMG</div>
                                    )}
                                </div>
                                <div className="player-info">
                                    <div className="player-name">{player.name}</div>
                                    <div className="player-team">{player.team}</div>
                                </div>
                                <button
                                    className="select-btn"
                                    disabled={
                                        player.status !== 'a' || // data-status가 'a'가 아닌 경우만 disabled
                                        draftCompleted ||
                                        isSelectingPlayer
                                    }
                                    onClick={() => handlePlayerSelect(player)}
                                    title={
                                        !isPlayerSelectable(player.status) ? getStatusReason(player.status) : ''
                                    }
                                >
                                    {selectedPlayerIds.includes(player.id) ? '선택됨' :
                                     isSelectingPlayer ? '선택 중...' : '선택'}
                                </button>
                                
                                {/* hidden 데이터들 (화면에는 보이지 않음) */}
                                <div style={{ display: 'none' }}>
                                    <span data-id={player.id}></span>
                                    <span data-web-name={player.webName}></span>
                                    <span data-kr-name={player.krName}></span>
                                    <span data-status={player.status}></span>
                                    <span data-team-name={player.teamName}></span>
                                    <span data-team-kr-name={player.teamKrName}></span>
                                    <span data-element-type-id={player.elementTypeId}></span>
                                    <span data-element-type-plural-name={player.elementTypePluralName}></span>
                                    <span data-element-type-kr-name={player.elementTypeKrName}></span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 참가자 + 내 선수 정보 */}
                <div className="section info-section">
                    <div>
                        <h3 className="section-title">참가자 ({participants.length}명)</h3>
                        <div className="users-grid">
                            {participantLoading && (
                                <div className="loading-message">참가자 정보를 불러오는 중...</div>
                            )}
                            
                            {participantError && (
                                <div className="error-message">
                                    참가자 정보를 불러오는데 실패했습니다: {participantError}
                                </div>
                            )}
                            
                            {!participantLoading && !participantError && participants.map((participant, idx) => {
                                const participantIsBot = isBot(participant);
                                const displayName = participantIsBot
                                    ? `Bot${idx + 1}`
                                    : (participant.userName && participant.userName.trim() !== ""
                                        ? participant.userName
                                        : `User${idx + 1}`);

                                const pickCount = participantPickCounts[participant.participantId] || 0;
                                
                                // 현재 턴 참가자 찾기 (currentTurnIndex의 participantUserNumber와 비교)
                                const currentTurnParticipant = participants[currentTurnIndex];
                                const isCurrentTurn = draftStarted && !draftCompleted && 
                                    currentTurnParticipant && currentTurnParticipant.participantUserNumber === participant.participantUserNumber;

                                return (
                                    <div 
                                        key={participant.participantId} 
                                        className={`user-card ${isCurrentTurn ? 'active' : ''} ${participantIsBot ? 'bot-card' : ''} ${selectedParticipantId === participant.participantId ? 'selected' : ''}`}
                                        onClick={() => handleParticipantCardClick(participant.participantId)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="user-name">
                                            {displayName}
                                            {participantIsBot && <span className="bot-badge">🤖</span>}
                                        </div>
                                        <div className="user-picks">
                                            {pickCount}/11 선택
                                            {isCurrentTurn && ' (현재 턴)'}
                                            {participantIsBot && isCurrentTurn && ' (선택 중...)'}
                                        </div>
                                        
                                        {/* hidden 데이터들 */}
                                        <div style={{ display: 'none' }}>
                                            <span data-participant-id={participant.participantId}></span>
                                            <span data-participant-user-number={participant.participantUserNumber}></span>
                                            <span data-participant-dummy={participant.participantDummy}></span>
                                            <span data-user-email={participant.userEmail}></span>
                                            <span data-user-name={displayName}></span>
                                            <span data-user-flag={participant.userFlag}></span>
                                            <span data-is-bot={participantIsBot}></span>
                                            <span data-is-user={participant.userFlag === true}></span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ flex: 1 }}>
                        <h3 className="section-title">
                            {selectedParticipantId ? 
                                `선택된 참가자의 선수 (${selectedParticipantDraftedPlayers.length}/11)` : 
                                `내 선수 (${myPlayerCount}/11)`
                            }
                        </h3>
                        <div className="my-players">
                            {draftedPlayersLoading && (
                                <div className="loading-message">드래프트된 선수 정보를 불러오는 중...</div>
                            )}
                            
                            {draftedPlayersError && (
                                <div className="error-message">
                                    드래프트된 선수 정보를 불러오는데 실패했습니다: {draftedPlayersError}
                                </div>
                            )}
                            
                            {!draftedPlayersLoading && !draftedPlayersError && selectedParticipantDraftedPlayers.length === 0 && (
                                <div className="no-players-message">
                                    {selectedParticipantId ? '아직 선택된 선수가 없습니다.' : '참가자를 클릭하여 선수를 확인하세요.'}
                                </div>
                            )}
                            
                            {!draftedPlayersLoading && !draftedPlayersError && selectedParticipantDraftedPlayers.map((draftedPlayer, idx) => (
                                <div key={idx} className="my-player-item">
                                    <div className="my-player-position">
                                        {getPositionCodeFromPluralName(draftedPlayer.elementTypePluralName)}
                                    </div>
                                    <div className="my-player-photo">
                                        {draftedPlayer.playerPic ? (
                                            <img 
                                                src={draftedPlayer.playerPic} 
                                                alt={draftedPlayer.playerKrName || draftedPlayer.playerWebName}
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div className="no-photo-small">NO IMG</div>
                                        )}
                                    </div>
                                    <div className="my-player-name">
                                        {draftedPlayer.playerKrName && draftedPlayer.playerKrName.trim() !== '' 
                                            ? draftedPlayer.playerKrName 
                                            : draftedPlayer.playerWebName}
                                    </div>
                                    
                                    {/* hidden 데이터들 (화면에는 보이지 않음) */}
                                    <div style={{ display: 'none' }}>
                                        <span data-participant-id={draftedPlayer.participantId}></span>
                                        <span data-player-id={draftedPlayer.playerId}></span>
                                        <span data-player-web-name={draftedPlayer.playerWebName}></span>
                                        <span data-player-kr-name={draftedPlayer.playerKrName}></span>
                                        <span data-player-pic={draftedPlayer.playerPic}></span>
                                        <span data-team-id={draftedPlayer.teamId}></span>
                                        <span data-team-name={draftedPlayer.teamName}></span>
                                        <span data-team-kr-name={draftedPlayer.teamKrName}></span>
                                        <span data-element-type-id={draftedPlayer.elementTypeId}></span>
                                        <span data-element-type-plural-name={draftedPlayer.elementTypePluralName}></span>
                                        <span data-element-type-kr-name={draftedPlayer.elementTypeKrName}></span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
