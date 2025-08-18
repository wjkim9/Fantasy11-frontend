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
    const [remainingTime, setRemainingTime] = useState('00:00:00'); // HH:MM:SS
    const [status, setStatus] = useState('BEFORE_OPEN'); // BEFORE_OPEN / OPEN / LOCKED

    // 상태 ref (재연결/클로저 이슈 방지)
    const hasJoinedRef = useRef(false);     // OPEN에서 JOIN을 보냈는가
    const lockedHoldRef = useRef(false);    // LOCKED/LOCKED_HOLD 대기 모드
    const navigatedRef = useRef(false);     // 중복 이동 방지
    const pollingRef = useRef(null);
    const lockTimeoutRef = useRef(null);

    // 카운트다운 계산용 타깃 절대시각(ms)
    const targetMsRef = useRef(null);

    // 유틸: TZ 없는 ISO → Date
    const toMs = (isoLocal) => {
        if (!isoLocal) return null;
        const d = new Date(isoLocal);
        return isNaN(d.getTime()) ? null : d.getTime();
    };
    const fmtHMS = (sec) => {
        if (sec <= 0) return '00:00:00';
        const hh = Math.floor(sec / 3600);
        const mm = Math.floor((sec % 3600) / 60);
        const ss = sec % 60;
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
    };

    // 배정 폴백 조회 (서버 REST가 남아있다면 사용)
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
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        if (lockTimeoutRef.current) { clearTimeout(lockTimeoutRef.current); lockTimeoutRef.current = null; }
    };

    // 초기 상태 1회 조회(드리프트 보정에도 사용)
    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/match/status');
            if (!res.ok) return;
            const data = await res.json(); // {state, round:{openAt,lockAt,no}, count,...}
            applyStatusFromServer(data);
        } catch {/* ignore */}
    };

    // 서버 STATUS를 화면 상태로 반영 + 타깃 절대시각 세팅(remainingTime은 클라 계산)
    const applyStatusFromServer = (statusObj) => {
        if (!statusObj) return;
        const stateRaw = statusObj.state || 'BEFORE_OPEN';
        const nextState = stateRaw === 'LOCKED_HOLD' ? 'LOCKED' : stateRaw;
        setStatus(nextState);

        const round = statusObj.round || null;
        setRoundNo(round?.no || 0);
        setParticipantCount(Number(statusObj.count ?? 0));

        if (nextState === 'BEFORE_OPEN') {
            targetMsRef.current = toMs(round?.openAt);
        } else if (nextState === 'OPEN') {
            targetMsRef.current = toMs(round?.lockAt);
        } else {
            targetMsRef.current = null;
            setRemainingTime('00:00:00');
        }

        // 즉시 1회 계산
        if (targetMsRef.current) {
            const diffSec = Math.max(0, Math.floor((targetMsRef.current - Date.now()) / 1000));
            setRemainingTime(fmtHMS(diffSec));
        }
    };

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            alert('로그인이 필요합니다.');
            navigate('/login');
            return;
        }

        // 메인과 동일한 WS 베이스 결정
        const WS_BASE =
            (typeof import.meta !== 'undefined' &&
                import.meta.env &&
                import.meta.env.VITE_API_WS &&
                import.meta.env.VITE_API_WS.replace(/\/$/, '')) ||
            (window.REACT_APP_WS_BASE_URL && window.REACT_APP_WS_BASE_URL.replace(/\/$/, '')) ||
            'ws://localhost:8080';

        // 초기 REST 상태 1회 (WS 첫 메시지 전에도 타이머 표시되게)
        fetchStatus();

        const url = `${WS_BASE}/ws/match?token=${encodeURIComponent(token)}`;
        const socket = new WebSocket(url);
        socketRef.current = socket;

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'USER_ID') setUserId(msg.userId);

                if (msg.type === 'STATUS') {
                    // 서버 remainingTime은 무시하고 절대시각만 반영
                    applyStatusFromServer({
                        state: msg.state,
                        round: msg.round,
                        count: msg.count
                    });

                    // OPEN이면 JOIN 1회만 보냄
                    if (msg.state === 'OPEN') {
                        if (!hasJoinedRef.current && socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({ type: 'JOIN' }));
                            hasJoinedRef.current = true;
                        }
                    }

                    // LOCKED/LOCKED_HOLD → JOIN했던 유저는 배정 대기, 아니면 홈으로
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
    }, [navigate]);

    // 카운트다운 1초 틱(클라 계산)
    useEffect(() => {
        const id = setInterval(() => {
            const t = targetMsRef.current;
            if (!t) {
                setRemainingTime('00:00:00'); // LOCKED 등
                return;
            }
            const diffSec = Math.max(0, Math.floor((t - Date.now()) / 1000));
            setRemainingTime(fmtHMS(diffSec));
        }, 1000);
        return () => clearInterval(id);
    }, []);

    // 드리프트 보정: 60초마다 /status 재동기화
    useEffect(() => {
        const id = setInterval(fetchStatus, 60000);
        return () => clearInterval(id);
    }, []);

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
                            {Array.from({ length: participantCount }).map((_, i) => (
                                <div className="participant-item" key={i}>
                                    <span className="participant-name">참가자 #{i + 1}</span>
                                    <span className="participant-status">준비완료</span>
                                </div>
                            ))}
                            {participantCount === 0 && (
                                <div className="participant-item">
                                    <span className="participant-name">아직 참가자가 없습니다</span>
                                    <span className="participant-status">대기중</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <button className="cancel-btn" onClick={handleCancel}>대기 취소</button>
                </div>
            </div>
        </>
    );
}
