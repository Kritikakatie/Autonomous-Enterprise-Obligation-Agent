import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Bell, Settings, ScrollText,
  ChevronDown, LogOut, Shield, Zap
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import ContractDetail from './pages/ContractDetail';
import AuditLog from './pages/AuditLog';
import AdminSettings from './pages/AdminSettings';
import NotificationTray from './components/NotificationTray';
import './index.css';

// ── Auth Context ──────────────────────────────────────────────────────────────
export const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [role, setRole] = useState(() => localStorage.getItem('aeoa_role') || 'agent_auditor');
  const switchRole = (r) => { setRole(r); localStorage.setItem('aeoa_role', r); };
  return <AuthContext.Provider value={{ role, switchRole }}>{children}</AuthContext.Provider>;
}

// ── Notification Context ──────────────────────────────────────────────────────
export const NotifContext = createContext();

function NotifProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const wsRef = useRef(null);

  const loadNotifs = async (role) => {
    try {
      const res = await fetch(`http://localhost:8000/notifications?role=${role}`);
      const data = await res.json();
      setNotifications(data);
    } catch (e) { }
  };

  useEffect(() => {
    let mounted = true;
    let ws = null;

    const connect = () => {
      if (!mounted) return;
      try {
        ws = new WebSocket('ws://localhost:8000/ws/notifications');
        wsRef.current = ws;

        ws.onmessage = (e) => {
          if (mounted) {
            try { setNotifications(prev => [JSON.parse(e.data), ...prev]); }
            catch (_) { }
          }
        };

        ws.onerror = () => { }; // suppress console noise

        ws.onclose = () => {
          // Auto-reconnect after 3s, unless component unmounted
          if (mounted) setTimeout(connect, 3000);
        };
      } catch (e) { }
    };

    // Small delay prevents StrictMode double-mount from racing
    const timer = setTimeout(connect, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <NotifContext.Provider value={{ notifications, setNotifications, trayOpen, setTrayOpen, loadNotifs, unreadCount }}>
      {children}
    </NotifContext.Provider>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar() {
  const { role, switchRole } = useAuth();
  const { unreadCount, setTrayOpen, loadNotifs } = useContext(NotifContext);

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/audit-log', icon: ScrollText, label: 'Audit Log' },
    { to: '/admin', icon: Settings, label: 'Admin Settings' },
  ];

  return (
    <aside className="w-64 min-h-screen flex flex-col border-r border-gray-800/60 bg-gray-900/40">
      {/* Logo */}
      <div className="p-6 border-b border-gray-800/60">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <Zap size={18} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-sm text-white">AEOA</div>
            <div className="text-xs text-gray-500">Enterprise Agent</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={17} />
            <span>{label}</span>
          </NavLink>
        ))}

        <button
          onClick={() => { setTrayOpen(true); loadNotifs(role); }}
          className="sidebar-item w-full text-left relative"
        >
          <Bell size={17} />
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </nav>

      {/* Role Switcher */}
      <div className="p-4 border-t border-gray-800/60">
        <div className="bg-gray-800/50 rounded-xl p-3">
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1.5">
            <Shield size={12} />
            Current Role
          </div>
          <select
            value={role}
            onChange={e => switchRole(e.target.value)}
            className="w-full bg-transparent text-sm text-indigo-400 font-medium outline-none cursor-pointer"
          >
            <option value="agent_auditor">Agent Auditor</option>
            <option value="manager">Manager</option>
          </select>
        </div>
      </div>
    </aside>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
function AppShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contracts/:id" element={<ContractDetail />} />
          <Route path="/audit-log" element={<AuditLog />} />
          <Route path="/admin" element={<AdminSettings />} />
        </Routes>
      </main>
      <NotificationTray />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotifProvider>
          <AppShell />
        </NotifProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
