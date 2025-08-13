import React, { useEffect, useState, useRef } from "react";
import "./Main.css";
import { useNavigate } from "react-router-dom";
import axiosInstance from "../api/axiosInstance"; // 또는 경로에 맞게 수정

// WebSocket URL 설정 (환경에 따라 변경 가능)
const WS_BASE_URL = window.REACT_APP_WS_BASE_URL || "ws://localhost:8080";

export default function Main() {
  const navigate = useNavigate();

  const [remainingTime, setRemainingTime] = useState("--:--");
  const [matchState, setMatchState] = useState("BEFORE_OPEN"); // BEFORE_OPEN / OPEN / LOCKED
  const [roundNo, setRoundNo] = useState(0);
  const [userId, setUserId] = useState(null);
  const [teamTable, setTeamTable] = useState([]); // 팀 순위 데이터
  const [isLoadingTeams, setIsLoadingTeams] = useState(true); // 로딩 상태
  const [topPlayers, setTopPlayers] = useState([]); // Top 10 선수 데이터
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true); // 선수 데이터 로딩 상태
  const [topUsers, setTopUsers] = useState([]); // Top 10 유저 데이터 추가
  const [isLoadingUsers, setIsLoadingUsers] = useState(true); // 유저 데이터 로딩 상태 추가
  const [isLoggedIn, setIsLoggedIn] = useState(false); // 로그인 상태 관리
  const socketRef = useRef(null);

  // 로그인 상태 확인 함수
  const checkLoginStatus = () => {
    const accessToken = localStorage.getItem('accessToken');
    setIsLoggedIn(!!accessToken); // 토큰이 있으면 true, 없으면 false
  };

  // 팀명 한글 매핑 함수
  const getKoreanTeamName = (englishName) => {
    const teamNameMap = {
      'Arsenal': '아스날',
      'Aston Villa': '빌라',
      'Brighton': '브라이튼',
      'Burnley': '번리',
      'Chelsea': '첼시',
      'Crystal Palace': '팰리스',
      'Everton': '에버턴',
      'Fulham': '풀럼',
      'Liverpool': '리버풀',
      'Luton': '루턴',
      'Man City': '맨시티',
      'Man Utd': '맨유',
      'Newcastle': '뉴캐슬',
      'Nott\'m Forest': '노팅엄',
      'Sheffield Utd': '셰필드',
      'Spurs': '토트넘',
      'West Ham': '웨스트햄',
      'Wolves': '울버햄튼',
      'Brentford': '브렌트포드',
      'Bournemouth': '본머스',
      'Leeds': '리즈',
      'Sunderland': '선더랜드'
    };

    return teamNameMap[englishName] || englishName;
  };

  // Top 10 유저 데이터를 가져오는 함수 추가
  const fetchTopUsers = async () => {
    try {
      setIsLoadingUsers(true);
      const response = await fetch('http://localhost:8080/api/user/seasonBestScore');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTopUsers(data);
    } catch (error) {
      console.error("Top 10 유저 데이터를 불러오는데 실패했습니다:", error);
      setTopUsers([]);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Top 10 선수 데이터를 가져오는 함수 (토큰 없이 요청)
  const fetchTopPlayers = async () => {
    try {
      setIsLoadingPlayers(true);
      // 토큰 없이 요청하기 위해 일반 axios 사용
      const response = await fetch('http://localhost:8080/api/player/previousPlayer');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTopPlayers(data);
    } catch (error) {
      console.error("Top 10 선수 데이터를 불러오는데 실패했습니다:", error);
      // 에러 발생시 빈 배열로 설정
      setTopPlayers([]);
    } finally {
      setIsLoadingPlayers(false);
    }
  };

  // 팀 순위 데이터를 가져오는 함수 (토큰 없이 요청)
  const fetchTeamTable = async () => {
    try {
      setIsLoadingTeams(true);
      // 토큰 없이 요청하기 위해 일반 fetch 사용
      const response = await fetch('http://localhost:8080/api/team/getTable');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTeamTable(data);
    } catch (error) {
      console.error("팀 순위 데이터를 불러오는데 실패했습니다:", error);
      // 에러 발생시 빈 배열로 설정
      setTeamTable([]);
    } finally {
      setIsLoadingTeams(false);
    }
  };

  useEffect(() => {
    // 로그인 상태 확인
    checkLoginStatus();

    // 컴포넌트 마운트시 데이터 가져오기
    fetchTeamTable();
    fetchTopPlayers();
    fetchTopUsers(); // Top 10 유저 데이터도 가져오기

    // WebSocket URL도 환경 변수로 관리
    const socket = new WebSocket(`${WS_BASE_URL}/ws/match`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "USER_ID") {
        setUserId(msg.userId);
      }

      if (msg.type === "STATUS") {
        setRemainingTime(msg.remainingTime);
        setMatchState(msg.state);
        setRoundNo(msg.round?.no || 0);
      }
    };

    socket.onclose = () => {
      console.warn("WebSocket 연결 종료됨");
    };

    return () => {
      socket.close();
    };
  }, []);

  const handleLoginClick = async () => {
    if (isLoggedIn) {
      // 로그아웃 처리 - 백엔드 API 호출
      try {
        await axiosInstance.post('/logout');
        // 성공적으로 로그아웃되면 로컬 스토리지에서 토큰 제거
        localStorage.removeItem('accessToken');
        setIsLoggedIn(false);
        alert('로그아웃되었습니다.');
      } catch (error) {
        console.error('로그아웃 실패:', error);
        // 에러가 발생해도 로컬에서는 로그아웃 처리
        localStorage.removeItem('accessToken');
        setIsLoggedIn(false);
        alert('로그아웃되었습니다.');
      }
    } else {
      // 로그인 페이지로 이동
      navigate("/login");
    }
  };

  const handleDraftClick = () => {
    // 로그인 상태 확인
    if (!isLoggedIn) {
      const shouldNavigateToLogin = window.confirm("로그인이 필요합니다. 로그인 페이지로 이동할까요?");
      if (shouldNavigateToLogin) {
        navigate("/login");
      }
      return;
    }

    if (!userId) {
      alert("WebSocket 연결이 아직 안됐습니다!");
      return;
    }

    navigate(`/waiting?userId=${userId}`);
  };

  const draftDisabled = matchState !== "OPEN"; // 로그인 상태 확인 제거

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
              {roundNo}라운드 매치 등록 중<br />
              남은 시간: {remainingTime}
            </div>
        );
      case "LOCKED":
        return (
            <div style={{ textAlign: "center" }}>
              {roundNo}라운드 드래프트 종료
            </div>
        );
      default:
        return null;
    }
  };

  // Top 10 유저 렌더링 함수 추가
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

  // Top 10 선수 렌더링 함수
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
                      objectPosition: "center top" // 상단 중앙 기준으로 크롭
                    }}
                    onError={(e) => {
                      // 이미지 로드 실패시 기본 배경으로 대체
                      e.target.style.display = 'none';
                    }}
                />
            ) : null}
          </div>
          <div className="player-info">
            <div className="player-name">
              {player.krName && player.krName.trim() !== '' ? player.krName : player.playerName}
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

  // 팀 테이블 렌더링 함수
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
                  // 이미지 로드 실패시 대체 이미지 또는 숨김 처리
                  e.target.style.display = 'none';
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
            {isLoggedIn ? '로그아웃' : '로그인'}
          </button>
        </header>

        <div className="main-container">
          {/* EPL 순위 */}
          <div className="section section-epl">
            <h2 className="section-title">EPL 순위</h2>

            {/* EPL 테이블 - 헤더 고정을 위해 colgroup 복원 */}
            <table className="epl-table">
              <colgroup>
                <col style={{width: "50px"}}/>  {/* 순위 */}
                <col style={{width: "140px"}}/>  {/* 팀 + 엠블럼 (더 넓게) */}
                <col style={{width: "50px"}}/>  {/* 경기 */}
                <col style={{width: "40px"}}/>  {/* 승 */}
                <col style={{width: "40px"}}/>  {/* 무 */}
                <col style={{width: "40px"}}/>  {/* 패 */}
                <col style={{width: "50px"}}/>  {/* 승점 */}
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

          {/* TOP 10 유저 순위 */}
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
            <ul className="ranking-list">
              {renderTopUsers()}
            </ul>
          </div>

          {/* TOP 10 선수 */}
          <div className="section">
            <h2 className="section-title">추천 선수</h2>
            <ul className="player-list">
              {renderTopPlayers()}
            </ul>
          </div>
        </div>
      </>
  );
}