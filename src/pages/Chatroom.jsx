import React, { useState, useEffect, useRef } from 'react';
import './Chatroom.css';
import { useNavigate } from 'react-router-dom';

export default function Chatroom() {
    const navigate = useNavigate();
    const chatRef = useRef(null);
    const [selectedUser, setSelectedUser] = useState('user1');
    const [chatList, setChatList] = useState([
        { user: 'test1234@gmail.com', text: '와! 드래프트 재밌었네요! 다들 수고하셨습니다 🎉', time: '오후 3:25' },
        { user: 'soccer_king@gmail.com', text: '1위 축하해요! 정말 좋은 팀 구성이네요', time: '오후 3:26' },
        { user: 'fantasy_master@gmail.com', text: '홀란드 뽑힌 거 아쉽다 ㅠㅠ 다음엔 더 빨리 선택해야겠어요', time: '오후 3:27' },
        { user: 'epl_lover@gmail.com', text: '다들 정말 좋은 전략으로 팀 꾸미셨네요! 다음 시즌에 또 만나요!', time: '오후 3:28' }
    ]);
    const [message, setMessage] = useState('');

    const users = [
        { id: 'user1', name: 'test1234@gmail.com', score: 89, rank: '1위' },
        { id: 'user2', name: 'soccer_king@gmail.com', score: 85, rank: '2위' },
        { id: 'user3', name: 'fantasy_master@gmail.com', score: 82, rank: '3위' },
        { id: 'user4', name: 'epl_lover@gmail.com', score: 78, rank: '4위' }
    ];

    const formations = {
        user1: {
            name: 'test1234@gmail.com',
            players: {
                gk: ['앨리송'],
                df: ['반 다이크', '루벤 디아스', '칸셀루', '로버트슨'],
                mf: ['드 브라위너', '엔조 페르난데스', '브루노'],
                fw: ['손흥민', '홀란드', '살라']
            }
        }
    };

    const handleSendMessage = () => {
        if (!message.trim()) return;
        const now = new Date();
        const formattedTime = now.toLocaleTimeString('ko-KR', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        setChatList(prev => [...prev, { user: '나', text: message.trim(), time: formattedTime }]);
        setMessage('');
    };

    const handleSelectUser = (userId) => {
        setSelectedUser(userId);
    };

    const exitRoom = () => {
        if (window.confirm('채팅방에서 나가시겠습니까?')) {
            navigate('/');
        }
    };

    useEffect(() => {
        chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, [chatList]);

    return (
        <>
            <div className="header">
                <div className="logo">Fantasy11</div>
                <div className="room-info">
                    <div className="status">드래프트 룸 #1234</div>
                    <button className="exit-btn" onClick={exitRoom}>나가기</button>
                </div>
            </div>

            <div className="main-container">
                <div className="left-section">
                    <div className="users-section">
                        <div className="section-title">참가자 순위</div>
                        <div className="users-grid">
                            {users.map(user => (
                                <div
                                    key={user.id}
                                    className={`user-card ${selectedUser === user.id ? 'active' : ''}`}
                                    onClick={() => handleSelectUser(user.id)}
                                >
                                    <div className="user-name">{user.name}</div>
                                    <div className="user-score">{user.score}점</div>
                                    <div className="user-rank">{user.rank}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="formation-section">
                        <div className="section-title">{formations[selectedUser]?.name}의 팀</div>
                        <div className="formation-field">
                            <div className="field-lines"></div>
                            <div className="formation-container">
                                <div className="formation-line">
                                    {formations[selectedUser]?.players.gk.map((name, idx) => (
                                        <div key={idx} className="player-card">
                                            <div className="player-photo-small"></div>
                                            <div className="player-name-small">{name}</div>
                                            <div className="player-position-badge">GK</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="formation-line">
                                    {formations[selectedUser]?.players.df.map((name, idx) => (
                                        <div key={idx} className="player-card">
                                            <div className="player-photo-small"></div>
                                            <div className="player-name-small">{name}</div>
                                            <div className="player-position-badge">DF</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="formation-line">
                                    {formations[selectedUser]?.players.mf.map((name, idx) => (
                                        <div key={idx} className="player-card">
                                            <div className="player-photo-small"></div>
                                            <div className="player-name-small">{name}</div>
                                            <div className="player-position-badge">MF</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="formation-line">
                                    {formations[selectedUser]?.players.fw.map((name, idx) => (
                                        <div key={idx} className="player-card">
                                            <div className="player-photo-small"></div>
                                            <div className="player-name-small">{name}</div>
                                            <div className="player-position-badge">FW</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="right-section">
                    <div className="section-title">채팅</div>
                    <div className="chat-messages" ref={chatRef}>
                        {chatList.map((msg, idx) => (
                            <div key={idx} className="chat-message">
                                <div className="chat-user">{msg.user}</div>
                                <div className="chat-text">{msg.text}</div>
                                <div className="chat-time">{msg.time}</div>
                            </div>
                        ))}
                    </div>
                    <div className="chat-input-container">
                        <input
                            type="text"
                            className="chat-input"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="메시지를 입력하세요..."
                        />
                        <button className="chat-send" onClick={handleSendMessage}>전송</button>
                    </div>
                </div>
            </div>
        </>
    );
}
