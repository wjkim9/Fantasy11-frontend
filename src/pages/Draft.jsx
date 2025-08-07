// src/pages/Draft.jsx
import React, { useEffect, useRef, useState } from 'react';
import './Draft.css';
import { useNavigate } from 'react-router-dom';

export default function Draft() {
    const [draftTime, setDraftTime] = useState(45);
    const [myPlayerCount, setMyPlayerCount] = useState(2);
    const [chatList, setChatList] = useState([
        { user: 'test1234@gmail.com', message: '좋은 선수들이 많네요!' },
        { user: 'soccer_king@gmail.com', message: '손흥민 누가 뽑을까요? ㅎㅎ' },
        { user: 'fantasy_master@gmail.com', message: '홀란드 먼저 가야죠' },
        { user: 'epl_lover@gmail.com', message: '전술 짜는 재미가 있네요' }
    ]);
    const [message, setMessage] = useState('');
    const chatBoxRef = useRef(null);
    const navigate = useNavigate();

    // 드래프트 타이머
    useEffect(() => {
        const interval = setInterval(() => {
            setDraftTime(prev => {
                if (prev <= 0) {
                    alert('시간이 만료되었습니다. 자동으로 선수가 선택됩니다.');
                    return 45;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

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
            alert('메인 페이지로 돌아갑니다.');
            navigate('/');
        }
    };

    useEffect(() => {
        chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }, [chatList]);

    return (
        <>
            <header className="header">
                <div className="logo">Fantasy11</div>
                <button className="cancel-btn" onClick={() => navigate('/chatroom')}>
                    👉 채팅방 이동 (개발용)
                </button>
                <div className="draft-info">
                    <span>라운드 2/11</span>
                    <div className="timer">{formatTime(draftTime)}</div>
                    <span>턴: soccer_king님</span>
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
                        <input
                            type="text"
                            className="search-input"
                            placeholder="선수 이름 또는 팀으로 검색..."
                            // 검색 기능은 이후 구현
                        />
                    </div>
                    <div className="player-list">
                        {/* 선수 목록 */}
                        {[
                            { name: '엘링 홀란드', team: '맨시티', position: 'FW' },
                            { name: '손흥민', team: '토트넘', position: 'FW' },
                            { name: '모하메드 살라', team: '리버풀', position: 'FW' },
                            { name: '해리 케인', team: '토트넘', position: 'FW' },
                            { name: '케빈 드 브라위너', team: '맨시티', position: 'MF' },
                            { name: '브루노 페르난데스', team: '맨유', position: 'MF' },
                            { name: '엔조 페르난데스', team: '첼시', position: 'MF' },
                            { name: '버질 반 다이크', team: '리버풀', position: 'DF' },
                            { name: '앨리송', team: '리버풀', position: 'GK' }
                        ].map((player, idx) => (
                            <div key={idx} className="player-item">
                                <div className="player-position">{player.position}</div>
                                <div className="player-photo" />
                                <div className="player-info">
                                    <div className="player-name">{player.name}</div>
                                    <div className="player-team">{player.team}</div>
                                </div>
                                <button
                                    className="select-btn"
                                    disabled={myPlayerCount >= 11}
                                    onClick={() => {
                                        alert(`${player.name} 선수를 선택했습니다!`);
                                        setMyPlayerCount(prev => prev + 1);
                                    }}
                                >
                                    선택
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 참가자 + 내 선수 정보 */}
                <div className="section info-section">
                    <div>
                        <h3 className="section-title">참가자 (4명)</h3>
                        <div className="users-grid">
                            {[
                                { name: 'test1234@gmail.com', picks: '2/11 선택', active: false },
                                { name: 'soccer_king@gmail.com', picks: '1/11 선택 (현재 턴)', active: true },
                                { name: 'fantasy_master@gmail.com', picks: '2/11 선택', active: false },
                                { name: 'epl_lover@gmail.com', picks: '1/11 선택', active: false }
                            ].map((user, idx) => (
                                <div key={idx} className={`user-card ${user.active ? 'active' : ''}`}>
                                    <div className="user-name">{user.name}</div>
                                    <div className="user-picks">{user.picks}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ flex: 1 }}>
                        <h3 className="section-title">내 선수 ({myPlayerCount}/11)</h3>
                        <div className="my-players">
                            {/* 실제로 선택된 선수 목록은 state로 나중에 분리 가능 */}
                            <div className="my-player-item">
                                <div className="my-player-position">FW</div>
                                <div className="my-player-photo" />
                                <div className="my-player-name">마티아스 쿠냐</div>
                            </div>
                            <div className="my-player-item">
                                <div className="my-player-position">MF</div>
                                <div className="my-player-photo" />
                                <div className="my-player-name">엔조 페르난데스</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
