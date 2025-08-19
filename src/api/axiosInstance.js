import axios from 'axios';

// 백엔드 API의 기본 URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''; // ALB의 Path-based 라우팅을 위해 상대 경로 사용

const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
});

// 요청 인터셉터 (요청을 보내기 전에 실행)
axiosInstance.interceptors.request.use(
    (config) => {
        // localStorage에서 accessToken 가져오기
        const accessToken = localStorage.getItem('accessToken');

        // 토큰이 존재하면 Authorization 헤더에 추가
        if (accessToken) {
            config.headers['Authorization'] = `Bearer ${accessToken}`;
        }

        return config;
    },
    (error) => {
        // 요청 에러 처리
        return Promise.reject(error);
    }
);

export default axiosInstance;
