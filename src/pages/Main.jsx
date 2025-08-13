// src/pages/Main.jsx
import React, { useEffect, useState, useRef } from 'react';
import './Main.css';
import { useNavigate } from 'react-router-dom';

export default function Main() {
    const navigate = useNavigate();

    const [remainingTime, setRemainingTime] = useState('--:--');
    const [matchState, setMatchState] = useState('BEFORE_OPEN'); // BEFORE_OPEN / OPEN / LOCKED
    const [roundNo, setRoundNo] = useState(0);
    const socketRef = useRef(null);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            console.warn('accessToken 없음 → 로그인 필요');
            // 필요 시 자동 이동: navigate('/login');
            return;
        }

        const WS_BASE = (import.meta.env.VITE_API_WS?.replace(/\/$/, '')) || 'ws://localhost:8080';
        const url = `${WS_BASE}/ws/match?token=${encodeURIComponent(token)}`;

        const socket = new WebSocket(url);
        socketRef.current = socket;

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                // USER_ID는 더 이상 사용하지 않음 (서버 식별용)
                // if (msg.type === 'USER_ID') { /* ignore */ }

                if (msg.type === 'STATUS') {
                    setRemainingTime(msg.remainingTime);
                    setMatchState(msg.state);
                    setRoundNo(msg.round?.no || 0);
                }
            } catch {
                /* no-op */
            }
        };

        socket.onclose = () => {
            console.warn('WebSocket 연결 종료됨');
        };

        socket.onerror = () => {
            console.warn('WebSocket 에러');
        };

        return () => {
            try { socket.close(); } catch {}
        };
    }, [navigate]);

    const handleLoginClick = () => {
        navigate('/login');
    };

    const handleDraftClick = () => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            alert('로그인이 필요합니다.');
            return;
        }
        if (matchState !== 'OPEN') {
            alert('현재는 매치 등록 시간이 아닙니다.');
            return;
        }
        // ✅ 쿼리스트링으로 userId 전달하지 않음
        navigate('/waiting');
    };

    const draftDisabled = matchState !== 'OPEN';

    const getMatchStatusTextJSX = () => {
        switch (matchState) {
            case 'BEFORE_OPEN':
                return (
                    <div style={{ textAlign: 'center' }}>
                        {roundNo}라운드 매치<br />남은 시간: {remainingTime}
                    </div>
                );
            case 'OPEN':
                return (
                    <div style={{ textAlign: 'center' }}>
                        {roundNo}라운드 매치 등록 중<br />남은 시간: {remainingTime}
                    </div>
                );
            case 'LOCKED':
                return (
                    <div style={{ textAlign: 'center' }}>
                        {roundNo}라운드 드래프트 종료
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <>
            <header className="header">
                <div className="logo">Fantasy11</div>
                <button className="login-btn" onClick={handleLoginClick}>
                    로그인
                </button>
            </header>

            <div className="main-container">
                {/* EPL 순위 */}
                <div className="section">
                    <h2 className="section-title">EPL 순위</h2>
                    <table className="epl-table">
                        <thead>
                        <tr>
                            <th>순위</th><th>팀</th><th>팀명</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>승점</th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr><td>1</td><td><div className="team-logo" /></td><td>맨시티</td><td>25</td><td>19</td><td>4</td><td>2</td><td>61</td></tr>
                        <tr><td>2</td><td><div className="team-logo" /></td><td>아스날</td><td>25</td><td>18</td><td>5</td><td>2</td><td>59</td></tr>
                        <tr><td>3</td><td><div className="team-logo" /></td><td>리버풀</td><td>24</td><td>17</td><td>6</td><td>1</td><td>57</td></tr>
                        </tbody>
                    </table>
                </div>

                {/* TOP 10 유저 순위 + 매치 */}
                <div className="section">
                    <p>{getMatchStatusTextJSX()}</p>
                    <button
                        className="draft-btn"
                        onClick={handleDraftClick}
                        disabled={draftDisabled}
                        style={{ opacity: draftDisabled ? 0.5 : 1, cursor: draftDisabled ? 'not-allowed' : 'pointer' }}
                    >
                        🏆 드래프트 참가
                    </button>

                    <h2 className="section-title">Top 10 순위</h2>
                    <ul className="ranking-list">
                        <li className="ranking-item">
                            <div className="rank-number">1</div>
                            <div className="user-info">
                                <div className="user-email">test1234@gmail.com</div>
                            </div>
                            <div className="user-score">33점</div>
                        </li>
                    </ul>
                </div>

                {/* TOP 10 선수 */}
                <div className="section">
                    <h2 className="section-title">EPL Top 10 선수</h2>
                    <ul className="player-list">
                        <li className="player-item">
                            <div className="rank-number">1</div>
                            <div className="player-photo" />
                            <div className="player-info">
                                <div className="player-name">손흥민</div>
                                <div className="player-team">토트넘</div>
                            </div>
                            <div className="player-position">FW</div>
                        </li>
                    </ul>
                </div>
            </div>
        </>
    );
}
