import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Main from './pages/Main';
import Login from './pages/Login';
import Draft from './pages/Draft';
import Waiting from './pages/Waiting';
import Chatroom from './pages/Chatroom';
import AuthCallback from './pages/AuthCallback';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Main />} />
                <Route path="/login" element={<Login />} />
                <Route path="/draft" element={<Draft />} />
                <Route path="/waiting" element={<Waiting />} />
                <Route path="/chatroom" element={<Chatroom />} />
                <Route path="/chatroom/:roomId" element={<Chatroom />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;