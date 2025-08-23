// src/pages/Draft.jsx
window.global = window;
import React, { useEffect, useRef, useState } from 'react';
import './Draft.css';
import { useNavigate, useParams } from 'react-router-dom';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export default function Draft() {
    const [draftTime, setDraftTime] = useState(60); // 1. 45초 -> 60초로 변경
    const [myPlayerCount, setMyPlayerCount] = useState(2);
    const [chatList, setChatList] = useState([
        /*
        { user: 'test1234@gmail.com', message: '좋은 선수들이 많네요!' },
        { user: 'soccer_king@gmail.com', message: '손흥민 누가 뽑을까요? ㅎㅎ' },
        { user: 'fantasy_master@gmail.com', message: '홀란드 먼저 가야죠' },
        { user: 'epl_lover@gmail.com', message: '전술 짜는 재미가 있네요' }
         */
    ]);
    const [message, setMessage] = useState('');
    const [players, setPlayers] = useState([]); // 백엔드에서 받아온 선수 데이터
    const [loading, setLoading] = useState(true); // 로딩 상태
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
    const [showPlayerSelectMessage, setShowPlayerSelectMessage] = useState(false);
    
    // 2. 스네이크 드래프트 관련 상태 추가
    const [currentRound, setCurrentRound] = useState(1); // 현재 라운드
    const [isReverseRound, setIsReverseRound] = useState(false); // 역순 라운드 여부
    
    const chatBoxRef = useRef(null);
    const navigate = useNavigate();
    const { draftId } = useParams(); // URL에서 draftId 파라미터 가져오기
    const stompClientRef = useRef(null);
    const autoSelectTimeoutRef = useRef(null);
    const retryTimeoutRef = useRef(null);
    
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
               (participant.userName === null || participant.userName.trim() === "");
    };

    // 2. 스네이크 드래프트 순서 계산 함수 (수정됨)
    const getSnakeDraftTurnIndex = (totalSelections, participantCount) => {
        // totalSelections는 이미 선택된 선수의 수이므로, 다음 턴을 계산할 때는 그대로 사용
        const round = Math.floor(totalSelections / participantCount) + 1;
        const positionInRound = totalSelections % participantCount;
        
        console.log(`Snake draft calculation: totalSelections=${totalSelections}, participantCount=${participantCount}, round=${round}, positionInRound=${positionInRound}`);
        
        let turnIndex;
        // 홀수 라운드(1, 3, 5...)는 정순 (0, 1, 2, 3)
        if (round % 2 === 1) {
            turnIndex = positionInRound;
        } else {
            // 짝수 라운드(2, 4, 6...)는 역순 (3, 2, 1, 0)
            turnIndex = participantCount - 1 - positionInRound;
        }
        
        console.log(`Snake draft result: turnIndex=${turnIndex}`);
        return turnIndex;
    };

    // 현재 사용자의 차례인지 확인하는 함수
    const isMyTurn = () => {
        if (!draftStarted || draftCompleted || participants.length === 0) return false;
        
        const currentParticipant = participants[currentTurnIndex];
        if (!currentParticipant) return false;
        
        // Bot이 아니고 userFlag가 true인 경우 사용자의 차례
        return !isBot(currentParticipant) && currentParticipant.userFlag === true;
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
        if (!currentParticipant) return { isValid: false, message: '참가자 정보를 찾을 수 없습니다.' };
        
        // 현재 참가자가 선택한 선수들 필터링
        const currentParticipantDraftedPlayers = draftedPlayers.filter(
            player => player.participantId === currentParticipant.participantId
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
            return { isValid: false, message: '포지션 정보를 찾을 수 없습니다.' };
        }
        
        const maxPlayCount = elementType.squadMaxPlay;
        const currentCount = samePositionPlayers.length;
        
        console.log(`Position check for ${selectedPlayer.elementTypePluralName}:`, {
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
        
        return { isValid: true, message: '' };
    };

    // 드래프트된 선수 리스트 fetch
    useEffect(() => {
        const fetchDraftedPlayers = async () => {
            try {
                setDraftedPlayersLoading(true);

                const accessToken = localStorage.getItem("accessToken");

                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/draft/${draftId}/allPlayers`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${accessToken}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const draftedPlayersData = await response.json();
                setDraftedPlayers(draftedPlayersData);
                
                // 드래프트된 선수 ID들을 selectedPlayerIds에 추가
                const playerIds = draftedPlayersData.map(player => player.playerId);
                setSelectedPlayerIds(playerIds);
                
                setDraftedPlayersError(null);

                console.log('Drafted players loaded:', draftedPlayersData.length, 'players');

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
        
        return draftedPlayers.filter(player => player.participantId === selectedParticipantId);
    };

    // 참가자 데이터 fetch
    useEffect(() => {
        const fetchParticipants = async () => {
            try {
                setParticipantLoading(true);

                const accessToken = localStorage.getItem("accessToken");

                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/draft/${draftId}/participants`, {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${accessToken}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const participantData = await response.json();

                // participantUserNumber로 정렬
                const sortedParticipants = participantData.sort(
                    (a, b) => a.participantUserNumber - b.participantUserNumber
                );

                setParticipants(sortedParticipants);
                
                // 각 참가자별 선택 카운트 초기화
                const initialCounts = {};
                sortedParticipants.forEach(participant => {
                    initialCounts[participant.participantId] = 0;
                });
                setParticipantPickCounts(initialCounts);
                
                setParticipantError(null);

                // 참가자 데이터를 성공적으로 가져오면 카운트다운 시작
                setShowCountdown(true);

                // 참가자 정보 로그 출력
                console.log('Participants loaded:', sortedParticipants.map(p => ({
                    id: p.participantId,
                    userFlag: p.userFlag,
                    userName: p.userName,
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

    // 드래프트 시작 카운트다운
    useEffect(() => {
        if (!showCountdown || draftStarted) return;

        const countdownInterval = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    // 카운트다운 종료, 드래프트 시작
                    setShowCountdown(false);
                    setDraftStarted(true);
                    clearInterval(countdownInterval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(countdownInterval);
    }, [showCountdown, draftStarted]);

    // 드래프트 완료 체크 함수
    const checkDraftCompletion = (updatedPickCounts) => {
        console.log('Checking draft completion with counts:', updatedPickCounts);
        console.log('Participants:', participants);
        
        if (participants.length === 0) return false;
        
        // 모든 참가자가 11명씩 선택했는지 확인
        const allCompleted = participants.every(participant => {
            const pickCount = updatedPickCounts[participant.participantId] || 0;
            console.log(`Participant ${participant.participantId} (${participant.userName}): ${pickCount}/11`);
            return pickCount >= 11;
        });
        
        console.log('All participants completed:', allCompleted);
        return allCompleted;
    };

    // 4. 드래프트 완료 후 채팅방으로 리다이렉트 하는 함수
    const handleDraftCompletion = async () => {
        try {
            const accessToken = localStorage.getItem("accessToken");
            
            const params = new URLSearchParams({ draftId: draftId });
            
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/chat-rooms/getChatroomId?${params}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const chatRoomData = await response.json();
            
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
        
        console.log(`Bot ${currentParticipant.participantId} is auto-selecting...`);
        
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
            console.log('No available players within position limits for bot');
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
        if (currentParticipant.userFlag !== true) {
            console.log(`Not a real user (userFlag: ${currentParticipant.userFlag}), waiting for WebSocket response...`);
            return; // 대기 상태 유지, 다음 턴으로 이동하지 않음, 자동 선택하지 않음
        }
        
        console.log(`User ${currentParticipant.participantId} time expired, sending random select request...`);
        
        // 실제 사용자인 경우 랜덤 선택 WebSocket 통신 전송
        if (!stompClientRef.current || !stompClientRef.current.connected) {
            console.error('WebSocket not connected for random select');
            return;
        }

        // 랜덤 선택 요청 데이터 구성
        const randomSelectData = {
            draftId: draftId
        };

        console.log('Sending random player selection request:', randomSelectData);

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
        if (currentParticipant && !isBot(currentParticipant) && currentParticipant.userFlag === true && !isSelectingPlayer) {
            performUserAutoSelect();
            return;
        }
        
        // 그 외의 경우 (Bot이거나 data-is-user가 false인 다른 사용자) - 타이머 일시정지
        console.log(`Time expired for participant ${currentParticipant?.participantId}, pausing timer and waiting for WebSocket response...`);
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
            const nextTurnIndex = getSnakeDraftTurnIndex(totalSelections, participants.length);
            
            // 현재 라운드 계산 업데이트
            const newRound = Math.floor(totalSelections / participants.length) + 1;
            setCurrentRound(newRound);
            setIsReverseRound(newRound % 2 === 0);
            
            setCurrentTurnIndex(nextTurnIndex);
            setDraftTime(60); // 새로운 턴 시작시 60초로 리셋
            console.log(`Turn moved to ${nextTurnIndex} using snake draft (round: ${newRound}, totalSelections: ${totalSelections})`);
            
            return currentCounts; // 카운트는 변경하지 않음
        });
    };

    // 드래프트 턴 시스템 (수정됨)
    useEffect(() => {
        if (!draftStarted || participants.length === 0 || draftCompleted) return;

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
        if (!draftStarted || draftCompleted || participants.length === 0) return;
        
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

    // WebSocket 연결 설정 (일부 수정됨)
    useEffect(() => {
        const connectWebSocket = () => {
            const token = localStorage.getItem("accessToken");
            if (!token) {
                console.error("WebSocket 연결 실패: 토큰이 없음");
                return;
            }
            
            const socket = new SockJS(`${import.meta.env.VITE_API_BASE_URL}/ws-draft?token=Bearer ${encodeURIComponent(token)}`);
            const stompClient = new Client({
                webSocketFactory: () => socket,
                debug: (str) => {
                    console.log('STOMP Debug: ', str);
                },
                onConnect: (frame) => {
                    console.log('Connected: ' + frame);
                    console.log(`topic/draft is  ${draftId}` );
                    
                    // 드래프트 토픽 구독
                    stompClient.subscribe(`/topic/draft.${draftId}`, (message) => {
                        const draftResponse = JSON.parse(message.body);
                        console.log('Received draft message:', draftResponse);
                        
                        setIsSelectingPlayer(false); // 선수 선택 완료
                        
                        // alreadySelected에 따른 처리
                        if (draftResponse.alreadySelected) {
                            console.log('Player already selected, retrying...');
                            
                            const currentParticipant = participants[currentTurnIndex];
                            
                            // Bot인 경우 다시 시도 (Bot 자동 선택 제거)
                            if (currentParticipant && isBot(currentParticipant)) {
                                console.log('Bot retrying selection - but auto selection removed, waiting for WebSocket...');
                                // Bot 자동 선택 로직 제거 - WebSocket 응답만 기다림
                            } else {
                                // 실제 사용자인 경우 알림만 표시하고 타이머 재시작
                                alert('이미 선택 된 선수입니다. 다시 선택해 주시기 바랍니다.');
                                
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
                                    
                                    // 드래프트 완료 체크
                                    const isCompleted = checkDraftCompletion(updatedCounts);
                                    if (isCompleted) {
                                        console.log('Draft completed! Setting draftCompleted to true');
                                        setTimeout(() => {
                                            setDraftCompleted(true);
                                            if (turnTimer) {
                                                clearInterval(turnTimer);
                                                setTurnTimer(null);
                                            }
                                            // 4. 드래프트 완료 후 채팅방으로 리다이렉트
                                            handleDraftCompletion();
                                        }, 1000);
                                        return updatedCounts;
                                    }
                                    
                                    return updatedCounts;
                                });
                                
                                // 사용자인 경우 myPlayerCount 증가
                                if (!isBot(currentParticipant)) {
                                    setMyPlayerCount(prev => prev + 1);
                                }
                            }
                            
                            // 드래프트가 완료되지 않은 경우에만 다음 턴으로 이동
                            setTimeout(() => {
                                setParticipantPickCounts(currentCounts => {
                                    const isCompleted = checkDraftCompletion(currentCounts);
                                    if (!isCompleted) {
                                        moveToNextTurn();
                                    }
                                    return currentCounts;
                                });
                            }, 1500);
                        }
                    });
                },
                onStompError: (frame) => {
                    console.error('Broker reported error: ' + frame.headers['message']);
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
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/elementType/all`);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const elementTypeData = await response.json();
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
                setLoading(true);
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/playerCache`);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const playerData = await response.json();
                
                // PlayerDto 데이터를 화면에 표시할 형태로 변환
                const transformedPlayers = playerData.map(player => ({
                    // 화면 표시용 데이터
                    name: player.krName && player.krName.trim() !== '' ? player.krName : player.webName,
                    team: player.teamKrName && player.teamKrName.trim() !== '' ? player.teamKrName : player.teamName,
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
                setLoading(false);
            }
        };

        fetchPlayers();
    }, []);

    // 선수 선택 핸들러 (수정된 부분)
    const handlePlayerSelect = (player, isAutoSelect = false, isBotSelect = false) => {
        // 드래프트가 완료된 경우
        if (draftCompleted) {
            return;
        }
        
        const currentParticipant = participants[currentTurnIndex];
        if (!currentParticipant) return;
        
        // 자동 선택이나 Bot 선택이 아닌 경우 사용자의 차례인지 확인
        if (!isAutoSelect && !isBotSelect) {
            if (!isMyTurn()) {
                setShowWarningMessage(true);
                setTimeout(() => {
                    setShowWarningMessage(false);
                }, 3000);
                return;
            }
        }
        
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
            elementTypeKrName: player.elementTypeKrName
        };

        console.log('Sending player selection:', selectPlayerData);

        // WebSocket으로 선수 선택 요청 전송
        stompClientRef.current.publish({
            destination: '/app/draft/selectPlayer',
            body: JSON.stringify(selectPlayerData)
        });
    };

    // 검색 함수
    const handleSearch = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            
            if (searchParams.keyword.trim() !== '') {
                params.append('keyword', searchParams.keyword.trim());
            }
            
            if (searchParams.elementTypeId !== '') {
                params.append('elementTypeId', searchParams.elementTypeId);
            }
            
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/playerEs/search?${params.toString()}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const searchResults = await response.json();
            
            // PlayerEsDocument 데이터를 화면에 표시할 형태로 변환
            const transformedPlayers = searchResults.map(player => ({
                // 화면 표시용 데이터
                name: player.krName && player.krName.trim() !== '' ? player.krName : player.webName,
                team: player.teamKrName && player.teamKrName.trim() !== '' ? player.teamKrName : player.teamName,
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
            setLoading(false);
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
            handleSearch();
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

    const formatTime = (seconds) =>
        `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

    // 채팅 전송
    const handleSend = () => {
        if (message.trim() === '') return;
        setChatList(prev => [...prev, { user: '나', message }]);
        setMessage('');
    };

    // 채팅 엔터
    const handleKeyPress = (e) => {
        if (e.key === 'Enter') handleSend();
    };

    // 드래프트 나가기
    const handleExit = () => {
        if (window.confirm('정말로 드래프트에서 나가시겠습니까?')) {
            // WebSocket 연결 해제
            if (stompClientRef.current) {
                stompClientRef.current.deactivate();
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

    useEffect(() => {
        if (chatBoxRef.current) {
            chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
        }
    }, [chatList]);

    // 현재 턴인 참가자 정보 가져오기
    const getCurrentTurnParticipant = () => {
        if (!draftStarted || participants.length === 0 || draftCompleted) return null;
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
            
            {/* 드래프트 시작 카운트다운 오버레이 */}
            {showCountdown && (
                <div className="countdown-overlay">
                    <div className="countdown-content">
                        <h2>{countdown}초 후에 드래프트가 시작됩니다.</h2>
                    </div>
                </div>
            )}
            
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
                    <div className="timer">{formatTime(draftTime)}</div>
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
                                onClick={handleSearch}
                            >
                                검색
                            </button>
                        </div>
                    </div>
                    <div className="player-list">
                        {/* 로딩 중일 때 */}
                        {loading && (
                            <div className="loading-message">선수 데이터를 불러오는 중...</div>
                        )}
                        
                        {/* 에러 발생시 */}
                        {error && (
                            <div className="error-message">
                                선수 데이터를 불러오는데 실패했습니다: {error}
                            </div>
                        )}
                        
                        {/* 선수 목록 */}
                        {!loading && !error && players.map((player, idx) => (
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
                                        myPlayerCount >= 11 || 
                                        !isPlayerSelectable(player.status) ||
                                        draftCompleted ||
                                        isSelectingPlayer ||
                                        selectedPlayerIds.includes(player.id)
                                    }
                                    onClick={() => handlePlayerSelect(player)}
                                    title={
                                        selectedPlayerIds.includes(player.id) ? '이미 선택된 선수입니다' :
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

                                return (
                                    <div 
                                        key={participant.participantId} 
                                        className={`user-card ${draftStarted && !draftCompleted && idx === currentTurnIndex ? 'active' : ''} ${participantIsBot ? 'bot-card' : ''} ${selectedParticipantId === participant.participantId ? 'selected' : ''}`}
                                        onClick={() => handleParticipantCardClick(participant.participantId)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div className="user-name">
                                            {displayName}
                                            {participantIsBot && <span className="bot-badge">🤖</span>}
                                        </div>
                                        <div className="user-picks">
                                            {pickCount}/11 선택
                                            {draftStarted && !draftCompleted && idx === currentTurnIndex && ' (현재 턴)'}
                                            {participantIsBot && draftStarted && !draftCompleted && idx === currentTurnIndex && ' (선택 중...)'}
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