// src/pages/Waiting.jsx
import React, { useEffect, useRef, useState } from 'react';
import './Waiting.css';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Waiting() {
    const navigate = useNavigate();
    const location = useLocation();
    const socketRef = useRef(null);
    const [roundNo, setRoundNo] = useState(0);

    const [userId, setUserId] = useState(null);
    const [participantCount, setParticipantCount] = useState(0);
    const [remainingTime, setRemainingTime] = useState('--:--');
    const [status, setStatus] = useState('BEFORE_OPEN');

    const participants = [
        'test1234@gmail.com', 'soccer_king@gmail.com', 'fantasy_master@gmail.com',
        'epl_lover@gmail.com', 'draft_pro@gmail.com', 'football_fan@gmail.com',
        'goal_hunter@gmail.com', 'premier_league@gmail.com', 'champion@gmail.com',
        'messi_fan@gmail.com', 'ronaldo_lover@gmail.com', 'kane_supporter@gmail.com'
    ];

    useEffect(() => {
        const socket = new WebSocket("ws://localhost:8080/ws/match");
        socketRef.current = socket;

        socket.onopen = () => {
            console.log("✅ WebSocket 연결됨");
        };

        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === "USER_ID") {
                setUserId(msg.userId);
                socket.send(JSON.stringify({ type: "JOIN" }));
            }
            if (msg.type === "STATUS") {
                setParticipantCount(msg.count);
                setRemainingTime(msg.remainingTime);
                setStatus(msg.state);
                setRoundNo(msg.round?.no);

                if (msg.state === "LOCKED" || msg.state === "BEFORE_OPEN") {
                    socket.close();
                    navigate('/');
                }
            }
        };

        socket.onclose = () => {
            console.log("🔌 WebSocket 연결 종료됨");
        };

        return () => {
            socket.close();
        };
    }, [navigate]);

    const handleCancel = () => {
        if (window.confirm('정말로 드래프트 대기를 취소하시겠습니까?')) {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ type: "CANCEL" }));
                socketRef.current.close();
            }
            navigate('/');
        }
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
                        <span>드래프트 시작을 기다리고 있습니다...</span>
                    </div>

                    <div className="countdown-container">
                        <div className="countdown-title" style={{ textAlign: 'center' }}>
                            {roundNo}라운드<br />드래프트 시작까지
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
