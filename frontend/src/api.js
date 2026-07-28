import axios from 'axios';

const BASE = 'http://localhost:8000';

const api = axios.create({ baseURL: BASE });

// Helper to build role query
const r = (role) => ({ params: { role } });

export const uploadContract = (file, role) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/upload?role=${role}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
};

export const getContracts = (filters = {}) => api.get('/contracts', { params: filters });
export const getContract = (id) => api.get(`/contracts/${id}`);
export const updateExtraction = (id, data, role) => api.patch(`/contracts/${id}/extraction`, data, r(role));
export const confirmExtraction = (id, role) => api.post(`/contracts/${id}/confirm-extraction`, {}, r(role));

export const affirmDecision = (id, auditorId) => api.post(`/contracts/${id}/affirm`, { auditor_id: auditorId });
export const revokeDecision = (id, body) => api.post(`/contracts/${id}/revoke`, body);
export const amberSend = (id, body) => api.post(`/contracts/${id}/amber-send`, body);
export const amberReject = (id, body) => api.post(`/contracts/${id}/amber-reject`, body);
export const redAction = (id, body) => api.post(`/contracts/${id}/red-action`, body);

export const getNotifications = (role) => api.get('/notifications', r(role));
export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`);

export const getAuditLog = (params = {}) => api.get('/audit-log', { params });

export const getAdminSettings = () => api.get('/admin/settings');
export const updateAdminSettings = (data, role) => api.put('/admin/settings', data, r(role));
export const getAdminDashboard = () => api.get('/admin/dashboard');

// Email Agent
export const regenerateEmail = (contractId, body) => api.post(`/contracts/${contractId}/email/regenerate`, body);
export const sendVendorEmail = (contractId, body) => api.post(`/contracts/${contractId}/email/send`, body);
export const getEmailHistory = (contractId) => api.get(`/contracts/${contractId}/email/history`);

export default api;
