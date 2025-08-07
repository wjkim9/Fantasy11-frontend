import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Main from './pages/Main';
import Login from './pages/Login';
import Draft from './pages/Draft';
import Waiting from './pages/Waiting';
import Chatroom from './pages/Chatroom';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Main />} />
                <Route path="/login" element={<Login />} />
                <Route path="/draft" element={<Draft />} />
                <Route path="/waiting" element={<Waiting />} />
                <Route path="/chatroom" element={<Chatroom />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;