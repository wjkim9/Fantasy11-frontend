// src/pages/Waiting.jsx
import React, { useEffect, useRef, useState } from 'react';
import './Waiting.css';
import { useNavigate } from 'react-router-dom';

export default function Waiting() {
    const navigate = useNavigate();
    const socketRef = useRef(null);

    const [roundNo, setRoundNo] = useState(0);
    const [userId, setUserId] = useState(null);
    const [participantCount, setParticipantCount] = useState(0);
    const [remainingTime, setRemainingTime] = useState('--:--');
    const [status, setStatus] = useState('BEFORE_OPEN');

    // 상태 ref (재연결/클로저 이슈 방지)
    const hasJoinedRef = useRef(false);     // OPEN에서 JOIN을 보냈는가
    const lockedHoldRef = useRef(false);    // LOCKED/LOCKED_HOLD 대기 모드
    const navigatedRef = useRef(false);     // 중복 이동 방지
    const pollingRef = useRef(null);
    const lockTimeoutRef = useRef(null);

    // 데모용 참가자 이름
    const participants = [
        'test1234@gmail.com','soccer_king@gmail.com','fantasy_master@gmail.com',
        'epl_lover@gmail.com','draft_pro@gmail.com','football_fan@gmail.com',
        'goal_hunter@gmail.com','premier_league@gmail.com','champion@gmail.com',
        'messi_fan@gmail.com','ronaldo_lover@gmail.com','kane_supporter@gmail.com'
    ];

    // 배정 폴백 조회
    const checkAssignment = async () => {
        try {
            const token = localStorage.getItem('accessToken');
            const res = await fetch('/api/match/assignment', {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const { draftId } = await res.json();
                if (draftId && !navigatedRef.current) {
                    navigatedRef.current = true;
                    try { socketRef.current?.close(); } catch {}
                    navigate(`/draft/${draftId}`);
                }
            }
            // 204/404 → 배정 없음, 계속 폴링
        } catch {
            // 일시 오류 무시
        }
    };

    // 폴링/타임아웃 제어
    const startLockedWaiting = () => {
        if (lockedHoldRef.current) return;
        lockedHoldRef.current = true;

        if (!pollingRef.current) {
            pollingRef.current = setInterval(checkAssignment, 1500);
        }
        if (!lockTimeoutRef.current) {
            lockTimeoutRef.current = setTimeout(() => {
                if (!navigatedRef.current) {
                    alert('매칭이 지연되어 메인으로 돌아갑니다.');
                    navigate('/');
                }
            }, 30000);
        }
    };

    const stopLockedWaiting = () => {
        lockedHoldRef.current = false;
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        if (lockTimeoutRef.current) {
            clearTimeout(lockTimeoutRef.current);
            lockTimeoutRef.current = null;
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            alert('로그인이 필요합니다.');
            navigate('/login');
            return;
        }

        // Main.jsx와 동일한 방식으로 WS 베이스 결정
        const WS_BASE =
            (typeof import.meta !== 'undefined' &&
                import.meta.env &&
                import.meta.env.VITE_API_WS &&
                import.meta.env.VITE_API_WS.replace(/\/$/, '')) ||
            (window.REACT_APP_WS_BASE_URL && window.REACT_APP_WS_BASE_URL.replace(/\/$/, '')) ||
            'ws://localhost:8080';

        const url = `${WS_BASE}/ws/match?token=${encodeURIComponent(token)}`;
        const socket = new WebSocket(url);
        socketRef.current = socket;

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'USER_ID') {
                    setUserId(msg.userId);
                }

                if (msg.type === 'STATUS') {
                    setParticipantCount(msg.count);
                    setRemainingTime(msg.remainingTime);
                    setStatus(msg.state);
                    setRoundNo(msg.round?.no || 0);

                    // OPEN이면 JOIN 1회만 보냄 (재연결 시에도 hasJoinedRef로 가드)
                    if (msg.state === 'OPEN') {
                        if (!hasJoinedRef.current && socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({ type: 'JOIN' }));
                            hasJoinedRef.current = true;
                        }
                    }

                    // LOCKED 또는 LOCKED_HOLD → 이미 JOIN한 유저는 '배정 대기' 모드로
                    if (msg.state === 'LOCKED' || msg.state === 'LOCKED_HOLD') {
                        if (hasJoinedRef.current) {
                            startLockedWaiting();
                        } else {
                            try { socket.close(); } catch {}
                            if (!navigatedRef.current) navigate('/');
                        }
                    }
                }

                if (msg.type === 'DRAFT_START' && msg.draftId) {
                    stopLockedWaiting();
                    if (!navigatedRef.current) {
                        navigatedRef.current = true;
                        try { socket.close(); } catch {}
                        navigate(`/draft/${msg.draftId}`);
                    }
                }
            } catch {
                // ignore
            }
        };

        socket.onclose = () => { /* 필요시 로깅 */ };
        socket.onerror = () => { /* 필요시 로깅 */ };

        return () => {
            try { socket.close(); } catch {}
            stopLockedWaiting();
        };
        // ✅ 의도적으로 빈 배열: 소켓은 한 번만 생성. 상태는 ref로 관리.
    }, [navigate]);

    const handleCancel = () => {
        if (!window.confirm('정말로 드래프트 대기를 취소하시겠습니까?')) return;
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: 'CANCEL' }));
            try { socketRef.current.close(); } catch {}
        }
        stopLockedWaiting();
        navigate('/');
    };

    return (
        <>
            <header className="header">
                <div className="logo" onClick={handleCancel}>Fantasy11</div>
                <button className="back-btn" onClick={handleCancel}>메인으로</button>
            </header>

            <div className="waiting-container">
                <div className="waiting-card">
                    <div className="waiting-count">{participantCount}명 대기중</div>

                    <div className="waiting-status">
                        <div className="loading-spinner"></div>
                        <span>
              {lockedHoldRef.current
                  ? '매칭 확정 중입니다...'
                  : (status === 'OPEN'
                      ? '드래프트 등록 중...'
                      : status === 'BEFORE_OPEN'
                          ? '매치 오픈을 기다리는 중...'
                          : '드래프트 종료')}
            </span>
                    </div>

                    <div className="countdown-container">
                        <div className="countdown-title" style={{ textAlign: 'center' }}>
                            {roundNo}라운드<br />
                            {status === 'OPEN' ? '등록 마감까지' : '드래프트 시작까지'}
                        </div>
                        <div className="countdown-timer">{remainingTime}</div>
                    </div>

                    <div className="participants-list">
                        <div className="participants-title">참가자 목록</div>
                        <div id="participantsList">
                            {participants.slice(0, participantCount).map((name, i) => (
                                <div className="participant-item" key={i}>
                                    <span className="participant-name">{name}</span>
                                    <span className="participant-status">준비완료</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button className="cancel-btn" onClick={handleCancel}>대기 취소</button>
                </div>
            </div>
        </>
    );
}
