import React, { useEffect, useState, useRef } from "react";
import "./Main.css";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../api/axiosInstance";

// WebSocket Base URL
const WS_BASE =
    (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_API_WS_URL &&
        import.meta.env.VITE_API_WS_URL.replace(/\/$/, "")) ||
    (window.REACT_APP_WS_BASE_URL && window.REACT_APP_WS_BASE_URL.replace(/\/$/, "")) ||
    'wss://localhost:8080';

export default function Main() {
    const navigate = useNavigate();

    // 공통 상태
    const [remainingTime, setRemainingTime] = useState("00:00:00"); // HH:MM:SS
    const [matchState, setMatchState] = useState("BEFORE_OPEN"); // BEFORE_OPEN / OPEN / LOCKED
    const [roundNo, setRoundNo] = useState(0);

    // 부가 데이터
    const [teamTable, setTeamTable] = useState([]);
    const [isLoadingTeams, setIsLoadingTeams] = useState(true);
    const [topPlayers, setTopPlayers] = useState([]);
    const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
    const [topUsers, setTopUsers] = useState([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const socketRef = useRef(null);

    // 카운트다운 계산용 타깃 절대시각(ms)
    const targetMsRef = useRef(null);

    const checkLoginStatus = () => {
        const accessToken = localStorage.getItem("accessToken");
        setIsLoggedIn(!!accessToken);
    };

    // 시간 유틸: 서버가 보내는 "YYYY-MM-DDTHH:mm:ss"(KST) → 로컬 Date
    const toMs = (isoLocal) => {
        if (!isoLocal) return null;
        // TZ 없는 ISO는 브라우저 로컬로 파싱됨. (운영 환경이 KST라면 그대로 일치)
        const d = new Date(isoLocal);
        return isNaN(d.getTime()) ? null : d.getTime();
    };

    const fmtHMS = (sec) => {
        if (sec <= 0) return "00:00:00";
        const hh = Math.floor(sec / 3600);
        const mm = Math.floor((sec % 3600) / 60);
        const ss = sec % 60;
        const pad = (n) => String(n).padStart(2, "0");
        return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
    };

    // 서버 STATUS를 화면 상태로 반영 + 타깃 절대시각 세팅
    const applyStatus = (status) => {
        if (!status) return;
        const stateRaw = status.state || "BEFORE_OPEN";
        const state = stateRaw === "LOCKED_HOLD" ? "LOCKED" : stateRaw; // 뷰는 LOCKED로 통일
        setMatchState(state);
        const round = status.round || null;
        setRoundNo(round?.no || 0);

        if (state === "BEFORE_OPEN") {
            targetMsRef.current = toMs(round?.openAt);
        } else if (state === "OPEN") {
            targetMsRef.current = toMs(round?.lockAt);
        } else {
            targetMsRef.current = null; // LOCKED
            setRemainingTime("00:00:00");
        }

        // 즉시 1회 계산(틱 기다리지 않도록)
        if (targetMsRef.current) {
            const diffSec = Math.max(0, Math.floor((targetMsRef.current - Date.now()) / 1000));
            setRemainingTime(fmtHMS(diffSec));
        }
    };

    // REST: 상태 1회 조회 (비로그인 허용)
    const fetchStatus = async () => {
        try {
            const res = await axiosInstance.get("/api/match/status"); // permitAll 필요
            applyStatus(res.data);
        } catch (e) {
            console.warn("status fetch 실패:", e);
        }
    };

    // Top 10 / 순위 데이터
    const fetchTopUsers = async () => {
        try {
            setIsLoadingUsers(true);

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/user/seasonBestScore`);

            const data = res.ok ? await res.json() : [];
            setTopUsers(data);
        } catch {
            setTopUsers([]);
        } finally {
            setIsLoadingUsers(false);
        }
    };
    const fetchTopPlayers = async () => {
        try {
            setIsLoadingPlayers(true);

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/player/previousPlayer`);

            const data = res.ok ? await res.json() : [];
            setTopPlayers(data);
        } catch {
            setTopPlayers([]);
        } finally {
            setIsLoadingPlayers(false);
        }
    };
    const fetchTeamTable = async () => {
        try {
            setIsLoadingTeams(true);

            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/team/getTable`);

            const data = res.ok ? await res.json() : [];
            setTeamTable(data);
        } catch {
            setTeamTable([]);
        } finally {
            setIsLoadingTeams(false);
        }
    };

    // 마운트: 로그인 체크 + 데이터 로딩 + 초기 STATUS + (로그인 시) WS 연결
    useEffect(() => {
        checkLoginStatus();
        fetchTeamTable();
        fetchTopPlayers();
        fetchTopUsers();
        fetchStatus(); // 비로그인 사용자도 남은 시간 노출

        const token = localStorage.getItem("accessToken");
        if (token) {
            const url = `${WS_BASE}/ws/match?token=${encodeURIComponent(token)}`;
            const socket = new WebSocket(url);
            socketRef.current = socket;

            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === "STATUS") {
                        // 서버 remainingTime은 무시하고, 절대시각만 반영
                        applyStatus({
                            state: msg.state,
                            round: msg.round,
                        });
                    }
                    // USER_ID 등은 메인 화면에선 사용 안 함
                } catch {
                    /* ignore */
                }
            };
            socket.onclose = () => console.warn("WebSocket 종료");
            socket.onerror = () => console.warn("WebSocket 에러");

            return () => {
                try {
                    socket.close();
                } catch {}
            };
        }
    }, []);

    // 카운트다운 1초 틱(클라 계산)
    useEffect(() => {
        const id = setInterval(() => {
            const t = targetMsRef.current;
            if (!t) {
                // LOCKED 등
                setRemainingTime("00:00:00");
                return;
            }
            const diffSec = Math.max(0, Math.floor((t - Date.now()) / 1000));
            setRemainingTime(fmtHMS(diffSec));
        }, 1000);
        return () => clearInterval(id);
    }, []);

    // 드리프트 보정: 60초마다 /status 재동기화 (로그인 여부 무관)
    useEffect(() => {
        const id = setInterval(fetchStatus, 60000);
        return () => clearInterval(id);
    }, []);

    // 로그인 / 로그아웃 버튼
    const handleLoginClick = async () => {
        if (isLoggedIn) {
            try {
                await axiosInstance.post("/api/auth/logout");
            } catch (error) {
                console.error("로그아웃 실패(로컬만 처리):", error);
            } finally {
                localStorage.removeItem("accessToken");
                setIsLoggedIn(false);
                alert("로그아웃되었습니다.");
            }
        } else {
            navigate("/login");
        }
    };

    // 드래프트 참가
    const handleDraftClick = () => {
        if (!isLoggedIn) {
            const go = window.confirm("로그인이 필요합니다. 로그인 페이지로 이동할까요?");
            if (go) navigate("/login");
            return;
        }
        if (matchState !== "OPEN") {
            alert("현재는 매치 등록 시간이 아닙니다.");
            return;
        }
        navigate("/waiting");
    };

    // Main.jsx 수정 - draft-btn 아래에 추가
// handleDraftClick 함수 아래에 이 함수 추가:

    const handleChatroomClick = async () => {
        if (!isLoggedIn) {
            const go = window.confirm("로그인이 필요합니다. 로그인 페이지로 이동할까요?");
            if (go) navigate("/login");
            return;
        }

        try {
            // 사용자의 현재 채팅방 정보 조회
            const response = await axiosInstance.get("/api/user/current-room");
            if (response.data && response.data.roomId) {
                navigate(`/chatroom/${response.data.roomId}`);
            } else {
                alert("참가중인 채팅방이 없습니다. 드래프트에 먼저 참가해주세요.");
            }
        } catch (error) {
            console.error("채팅방 정보 조회 실패:", error);
            if (error.response?.status === 401) {
                alert("로그인이 만료되었습니다. 다시 로그인해주세요.");
                navigate("/login");
            } else {
                alert("채팅방 정보를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.");
            }
        }
    };

    const draftDisabled = matchState !== "OPEN";

    const getMatchStatusTextJSX = () => {
        switch (matchState) {
            case "BEFORE_OPEN":
                return (
                    <div style={{ textAlign: "center" }}>
                        {roundNo}라운드 매치
                        <br />
                        남은 시간: {remainingTime}
                    </div>
                );
            case "OPEN":
                return (
                    <div style={{ textAlign: "center" }}>
                        {roundNo}라운드 매치 등록 중
                        <br />
                        남은 시간: {remainingTime}
                    </div>
                );
            case "LOCKED":
                return <div style={{ textAlign: "center" }}>{roundNo}라운드 드래프트 종료</div>;
            default:
                return null;
        }
    };

    // ===== 나머지 Top10/순위 렌더링은 기존 그대로 =====
    const getKoreanTeamName = (englishName) => {
        const teamNameMap = {
            Arsenal: "아스날",
            "Aston Villa": "빌라",
            Brighton: "브라이튼",
            Burnley: "번리",
            Chelsea: "첼시",
            "Crystal Palace": "팰리스",
            Everton: "에버턴",
            Fulham: "풀럼",
            Liverpool: "리버풀",
            Luton: "루턴",
            "Man City": "맨시티",
            "Man Utd": "맨유",
            Newcastle: "뉴캐슬",
            "Nott'm Forest": "노팅엄",
            "Sheffield Utd": "셰필드",
            Spurs: "토트넘",
            "West Ham": "웨스트햄",
            Wolves: "울버햄튼",
            Brentford: "브렌트포드",
            Bournemouth: "본머스",
            Leeds: "리즈",
            Sunderland: "선더랜드",
        };
        return teamNameMap[englishName] || englishName;
    };

    const renderTopUsers = () => {
        if (isLoadingUsers) {
            return (
                <li className="ranking-item">
                    <div style={{ textAlign: "center", padding: "2rem", width: "100%" }}>
                        유저 데이터 로딩 중...
                    </div>
                </li>
            );
        }
        if (topUsers.length === 0) {
            return (
                <li className="ranking-item">
                    <div style={{ textAlign: "center", padding: "2rem", width: "100%" }}>
                        시즌이 시작되지 않았습니다.
                    </div>
                </li>
            );
        }
        return topUsers.map((user, index) => (
            <li key={user.userId} className="ranking-item">
                <div className="rank-number">{index + 1}</div>
                <div className="user-info">
                    <div className="user-name" style={{ fontWeight: "bold", marginBottom: "4px" }}>
                        {user.name}
                    </div>
                    <div className="user-email" style={{ fontSize: "0.85rem", color: "#666" }}>
                        {user.email}
                    </div>
                </div>
                <div className="user-score">{user.score}점</div>
            </li>
        ));
    };

    const renderTopPlayers = () => {
        if (isLoadingPlayers) {
            return (
                <li className="player-item">
                    <div style={{ textAlign: "center", padding: "2rem", width: "100%" }}>
                        선수 데이터 로딩 중...
                    </div>
                </li>
            );
        }
        if (topPlayers.length === 0) {
            return (
                <li className="player-item">
                    <div style={{ textAlign: "center", padding: "2rem", width: "100%" }}>
                        선수 데이터를 불러올 수 없습니다.
                    </div>
                </li>
            );
        }
        return topPlayers.map((player, index) => (
            <li key={player.playerFplId} className="player-item">
                <div className="rank-number">{index + 1}</div>
                <div className="player-photo">
                    {player.pic ? (
                        <img
                            src={player.pic}
                            alt={`${player.playerName} 사진`}
                            style={{
                                width: "100%",
                                height: "100%",
                                borderRadius: "50%",
                                objectFit: "cover",
                                objectPosition: "center top",
                            }}
                            onError={(e) => {
                                e.currentTarget.style.display = "none";
                            }}
                        />
                    ) : null}
                </div>
                <div className="player-info">
                    <div className="player-name">
                        {player.krName && player.krName.trim() !== "" ? player.krName : player.playerName}
                    </div>
                    <div className="player-team">{getKoreanTeamName(player.teamName)}</div>
                    <div className="player-points" style={{ fontSize: "0.8rem", color: "#764ba2", fontWeight: "bold" }}>
                        {player.totalPoints}점
                    </div>
                </div>
                <div className="player-position">{player.etName}</div>
            </li>
        ));
    };

    const renderTeamTable = () => {
        if (isLoadingTeams) {
            return (
                <tr>
                    <td colSpan="7" style={{ textAlign: "center", padding: "2rem" }}>
                        순위 로딩 중...
                    </td>
                </tr>
            );
        }
        if (teamTable.length === 0) {
            return (
                <tr>
                    <td colSpan="7" style={{ textAlign: "center", padding: "2rem" }}>
                        순위 데이터를 불러올 수 없습니다.
                    </td>
                </tr>
            );
        }
        return teamTable.map((team) => (
            <tr key={team.fplId}>
                <td>{team.position}</td>
                <td className="team-cell">
                    <img
                        src={team.pic}
                        alt={`${team.name} 엠블럼`}
                        className="team-logo"
                        onError={(e) => {
                            e.currentTarget.style.display = "none";
                        }}
                    />
                    <span className="team-name">{getKoreanTeamName(team.name)}</span>
                </td>
                <td>{team.played}</td>
                <td>{team.win}</td>
                <td>{team.draw}</td>
                <td>{team.lose}</td>
                <td>{team.points}</td>
            </tr>
        ));
    };

    return (
        <>
            <header className="header">
                <div className="logo">Fantasy11</div>
                <button className="login-btn" onClick={handleLoginClick}>
                    {isLoggedIn ? "로그아웃" : "로그인"}
                </button>
            </header>

            <div className="main-container">
                {/* EPL 순위 */}
                <div className="section section-epl">
                    <h2 className="section-title">EPL 순위</h2>

                    <table className="epl-table">
                        <colgroup>
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "140px" }} />
                            <col style={{ width: "50px" }} />
                            <col style={{ width: "40px" }} />
                            <col style={{ width: "40px" }} />
                            <col style={{ width: "40px" }} />
                            <col style={{ width: "50px" }} />
                        </colgroup>
                        <thead>
                        <tr>
                            <th>순위</th>
                            <th>팀</th>
                            <th>경기</th>
                            <th>승</th>
                            <th>무</th>
                            <th>패</th>
                            <th>승점</th>
                        </tr>
                        </thead>
                        <tbody>{renderTeamTable()}</tbody>
                    </table>
                </div>

                {/* TOP 10 유저 순위 + 매치 */}
                <div className="section">
                    <p>{getMatchStatusTextJSX()}</p>
                    <button
                        className="draft-btn"
                        onClick={handleDraftClick}
                        disabled={matchState !== "OPEN"}
                        style={{
                            opacity: matchState !== "OPEN" ? 0.5 : 1,
                            cursor: matchState !== "OPEN" ? "not-allowed" : "pointer",
                        }}
                    >
                        🏆 드래프트 참가
                    </button>
                    <button
                        className="chatroom-btn"
                        onClick={handleChatroomClick}
                        style={{
                            width: '100%',
                            background: 'linear-gradient(45deg, #4CAF50, #45a049)',
                            color: 'white',
                            border: 'none',
                            padding: '1.2rem',
                            borderRadius: '10px',
                            fontSize: '1.2rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            marginBottom: '1rem',
                            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                            boxShadow: '0 4px 15px rgba(76, 175, 80, 0.3)'
                        }}
                    >
                        💬 채팅방 입장
                    </button>


                    <h2 className="section-title">Top 10 순위</h2>
                    <ul className="ranking-list">{renderTopUsers()}</ul>
                </div>

                {/* TOP 10 선수 */}
                <div className="section">
                    <h2 className="section-title">추천 선수</h2>
                    <ul className="player-list">{renderTopPlayers()}</ul>
                </div>
            </div>
        </>
    );
}