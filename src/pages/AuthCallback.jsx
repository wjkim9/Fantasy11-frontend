// src/pages/AuthCallback.jsx
import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function AuthCallback() {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        const accessToken = searchParams.get('accessToken');

        if (accessToken) {
            localStorage.setItem('accessToken', accessToken);
            console.log('Access Token 저장 완료');
            // 토큰 저장 후 메인 페이지로 이동
            navigate('/');
        } else {
            console.error('Access Token을 받지 못했습니다.');
            // 실패 시 로그인 페이지로 다시 이동
            navigate('/login');
        }
    }, [location, navigate]);

    return (
        <div>
            <p>로그인 처리 중...</p>
        </div>
    );
}
