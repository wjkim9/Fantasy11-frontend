// src/pages/Login.jsx
import React, { useEffect } from 'react';
import './Login.css';
import { useNavigate } from 'react-router-dom';

export default function Login() {
    const navigate = useNavigate();

    useEffect(() => {
        const loginCard = document.querySelector('.login-card');
        loginCard.style.opacity = '0';
        loginCard.style.transform = 'translateY(50px)';
        setTimeout(() => {
            loginCard.style.transition = 'all 0.8s ease';
            loginCard.style.opacity = '1';
            loginCard.style.transform = 'translateY(0)';
        }, 100);

        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                handleGoogleLogin();
            }
        };

        document.addEventListener('keypress', handleEnter);
        return () => document.removeEventListener('keypress', handleEnter);
    }, []);

    const handleGoogleLogin = () => {
        alert('구글 로그인을 진행합니다!');
    };

    const goToMain = () => {
        navigate('/');
    };

    return (
        <>
            <header className="header">
                <div className="logo" onClick={goToMain}>Fantasy11</div>
                <button className="back-btn" onClick={goToMain}>메인으로</button>
            </header>

            <div className="login-container">
                <div className="login-card">
                    <h1 className="welcome-text">환영합니다!</h1>
                    <p className="subtitle">Fantasy11에서 최고의 축구 드래프트 게임을<br />경험해보세요</p>

                    <button className="google-login-btn" onClick={handleGoogleLogin}>
                        <div className="google-icon">G</div>
                        <span className="btn-text">SIGN IN WITH GOOGLE</span>
                    </button>

                    <div className="features">
                        <div className="feature-item"><div className="feature-icon">⚽</div><span>실시간 EPL 데이터 기반 드래프트</span></div>
                        <div className="feature-item"><div className="feature-icon">🏆</div><span>전 세계 유저들과 실력 겨루기</span></div>
                        <div className="feature-item"><div className="feature-icon">📊</div><span>상세한 통계와 분석 제공</span></div>
                        <div className="feature-item"><div className="feature-icon">🎮</div><span>간편한 구글 계정 연동</span></div>
                    </div>
                </div>
            </div>
        </>
    );
}
