import React, { useEffect, useState, useRef } from "react";
import "./Main.css";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../api/axiosInstance"; // 경로 확인

// WebSocket Base URL (Vite/CRA/윈도우 전역 모두 대응)
const WS_BASE =
    (typeof import.meta !== "undefined" &&
        import.meta.env &&
        import.meta.env.VITE_API_WS &&
        import.meta.env.VITE_API_WS.replace(/\/$/, "")) ||
    (window.REACT_APP_WS_BASE_URL && window.REACT_APP_WS_BASE_URL.replace(/\/$/, "")) ||
    "ws://localhost:8080";

export default function Main() {
    const navigate = useNavigate();

    // 공통 상태
    const [remainingTime, setRemainingTime] = useState("--:--");
    const [matchState, setMatchState] = useState("BEFORE_OPEN"); // BEFORE_OPEN / OPEN / LOCKED
    const [roundNo, setRoundNo] = useState(0);

    // 확장 상태 (dev 브랜치 기능 유지)
    const [teamTable, setTeamTable] = useState([]); // 팀 순위 데이터
    const [isLoadingTeams, setIsLoadingTeams] = useState(true);
    const [topPlayers, setTopPlayers] = useState([]); // Top 10 선수 데이터
    const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
    const [topUsers, setTopUsers] = useState([]); // Top 10 유저 데이터
    const [isLoadingUsers, setIsLoadingUsers] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(false); // 로그인 상태

    const socketRef = useRef(null);

    // 로그인 상태 확인
    const checkLoginStatus = () => {
        const accessToken = localStorage.getItem("accessToken");
        setIsLoggedIn(!!accessToken);
    };

    // 팀명 한글 매핑
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

    // Top 10 유저
    const fetchTopUsers = async () => {
        try {
            setIsLoadingUsers(true);
            const res = await fetch("http://localhost:8080/api/user/seasonBestScore");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setTopUsers(data);
        } catch (e) {
            console.error("Top 10 유저 로드 실패:", e);
            setTopUsers([]);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    // Top 10 선수
    const fetchTopPlayers = async () => {
        try {
            setIsLoadingPlayers(true);
            const res = await fetch("http://localhost:8080/api/player/previousPlayer");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setTopPlayers(data);
        } catch (e) {
            console.error("Top 10 선수 로드 실패:", e);
            setTopPlayers([]);
        } finally {
            setIsLoadingPlayers(false);
        }
    };

    // 팀 순위
    const fetchTeamTable = async () => {
        try {
            setIsLoadingTeams(true);
            const res = await fetch("http://localhost:8080/api/team/getTable");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setTeamTable(data);
        } catch (e) {
            console.error("팀 순위 로드 실패:", e);
            setTeamTable([]);
        } finally {
            setIsLoadingTeams(false);
        }
    };

    // 마운트: 로그인 체크 + 데이터 로딩 + WS 연결(토큰 있을 때만)
    useEffect(() => {
        checkLoginStatus();
        fetchTeamTable();
        fetchTopPlayers();
        fetchTopUsers();

        const token = localStorage.getItem("accessToken");
        if (!token) {
            console.warn("accessToken 없음 → WS 미연결(메인 화면은 그대로 동작)");
            return;
        }

        const url = `${WS_BASE}/ws/match?token=${encodeURIComponent(token)}`;
        const socket = new WebSocket(url);
        socketRef.current = socket;

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                // USER_ID는 서버 식별용이라 메인 화면엔 불필요 → 무시
                // if (msg.type === "USER_ID") { /* ignore */ }

                if (msg.type === "STATUS") {
                    setRemainingTime(msg.remainingTime);
                    setMatchState(msg.state);
                    setRoundNo(msg.round?.no || 0);
                }
            } catch {
                /* no-op */
            }
        };

        socket.onclose = () => {
            console.warn("WebSocket 연결 종료됨");
        };

        socket.onerror = () => {
            console.warn("WebSocket 에러");
        };

        return () => {
            try {
                socket.close();
            } catch {}
        };
    }, []);

    // 로그인 / 로그아웃 버튼
    const handleLoginClick = async () => {
        if (isLoggedIn) {
            try {
                await axiosInstance.post("/logout");
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
        // ✅ userId 쿼리스트링 전달하지 않음
        navigate("/waiting");
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

    // Top 10 유저 렌더링
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

    // Top 10 선수 렌더링
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
                        {player.krName && player.krName.trim() !== ""
                            ? player.krName
                            : player.playerName}
                    </div>
                    <div className="player-team">{getKoreanTeamName(player.teamName)}</div>
                    <div
                        className="player-points"
                        style={{ fontSize: "0.8rem", color: "#764ba2", fontWeight: "bold" }}
                    >
                        {player.totalPoints}점
                    </div>
                </div>
                <div className="player-position">{player.etName}</div>
            </li>
        ));
    };

    // 팀 테이블 렌더링
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
                            <col style={{ width: "50px" }} /> {/* 순위 */}
                            <col style={{ width: "140px" }} /> {/* 팀 + 엠블럼 */}
                            <col style={{ width: "50px" }} /> {/* 경기 */}
                            <col style={{ width: "40px" }} /> {/* 승 */}
                            <col style={{ width: "40px" }} /> {/* 무 */}
                            <col style={{ width: "40px" }} /> {/* 패 */}
                            <col style={{ width: "50px" }} /> {/* 승점 */}
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
                        disabled={draftDisabled}
                        style={{
                            opacity: draftDisabled ? 0.5 : 1,
                            cursor: draftDisabled ? "not-allowed" : "pointer",
                        }}
                    >
                        🏆 드래프트 참가
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
