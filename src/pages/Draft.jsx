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
    const [players, setPlayers] = useState([]); // 백엔드에서 받아온 선수 데이터
    const [loading, setLoading] = useState(true); // 로딩 상태
    const [error, setError] = useState(null); // 에러 상태
    const [elementTypes, setElementTypes] = useState([]); // 포지션 타입 데이터
    const [searchParams, setSearchParams] = useState({
        keyword: '',
        elementTypeId: ''
    }); // 검색 파라미터
    const chatBoxRef = useRef(null);
    const navigate = useNavigate();

    // ElementType 데이터 fetch
    useEffect(() => {
        const fetchElementTypes = async () => {
            try {
                const response = await fetch('http://localhost:8080/api/elementType/all');
                
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
                const response = await fetch('http://localhost:8080/api/playerCache');
                
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
            
            const response = await fetch(`http://localhost:8080/api/playerEs/search?${params.toString()}`);
            
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
                        <div className="search-form">
                            <select
                                name="elementTypeId"
                                className="search-select"
                                value={searchParams.elementTypeId}
                                onChange={(e) => handleSearchInputChange('elementTypeId', e.target.value)}
                            >
                                <option value="">선택</option>
                                {elementTypes.map(elementType => (
                                    <option key={elementType.id} value={elementType.id}>
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
                                    disabled={myPlayerCount >= 11 || !isPlayerSelectable(player.status)}
                                    onClick={() => {
                                        alert(`${player.name} 선수를 선택했습니다!`);
                                        setMyPlayerCount(prev => prev + 1);
                                    }}
                                    title={!isPlayerSelectable(player.status) ? getStatusReason(player.status) : ''}
                                >
                                    선택
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