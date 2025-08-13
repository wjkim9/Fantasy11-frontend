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

    const [hasJoined, setHasJoined] = useState(false);        // OPEN에서 JOIN을 보냈는가
    const [lockedHold, setLockedHold] = useState(false);      // LOCKED 후 대기 모드(드래프트 배정 대기)
    const pollingRef = useRef(null);
    const lockTimeoutRef = useRef(null);
    const navigatedRef = useRef(false); // 중복 이동 방지

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
            // 204/404면 배정 없음 → 계속 폴링
        } catch {
            // 네트워크 일시 오류는 무시하고 재시도
        }
    };

    // 폴링/타임아웃 시작/정지 헬퍼
    const startLockedWaiting = () => {
        if (lockedHold) return;
        setLockedHold(true);

        // 1. 폴링 시작(1.5s)
        if (!pollingRef.current) {
            pollingRef.current = setInterval(checkAssignment, 1500);
        }
        // 2. 타임아웃(예: 30초) 뒤에도 배정 없으면 홈으로
        if (!lockTimeoutRef.current) {
            lockTimeoutRef.current = setTimeout(() => {
                if (!navigatedRef.current) {
                    alert('매칭이 지연되고 있어 메인으로 돌아갑니다.');
                    navigate('/');
                }
            }, 30000);
        }
    };

    const stopLockedWaiting = () => {
        setLockedHold(false);
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

        const WS_BASE = import.meta.env.VITE_API_WS?.replace(/\/$/, '') || 'ws://localhost:8080';
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

                    if (msg.state === 'OPEN') {
                        // OPEN이 되면 JOIN 1회만 전송
                        if (!hasJoined && socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({ type: 'JOIN' }));
                            setHasJoined(true);
                        }
                    } else if (msg.state === 'LOCKED') {
                        // 🔒 핵심: 이미 JOIN한 유저라면 홈으로 가지 않고 '배정 대기' 모드로 전환
                        if (hasJoined) {
                            startLockedWaiting();
                        } else {
                            // JOIN하지 않은 경우에만 홈 복귀
                            try { socket.close(); } catch {}
                            if (!navigatedRef.current) navigate('/');
                        }
                    } else if (msg.state === 'BEFORE_OPEN') {
                        // 그냥 카운트다운 대기 (아무 것도 안 함)
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

        socket.onclose = () => { /* 필요 시 로깅 */ };
        socket.onerror = () => { /* 필요 시 로깅 */ };

        return () => {
            try { socket.close(); } catch {}
            stopLockedWaiting();
        };
    }, [navigate, hasJoined]); // hasJoined 변경 시에도 핸들러 최신 상태 유지

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
              {lockedHold
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
