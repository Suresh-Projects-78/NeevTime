/**
 * Generic REST adapter — connect an HRMS/payroll vendor that is a plain REST
 * API, by configuration, without writing a new adapter class.
 *
 * Most vendors differ only in: the base URL, how you authenticate, which paths
 * hold employees/attendance/leave, and what the JSON fields are called. All of
 * that is config, so this one adapter covers the long tail. Reach for a bespoke
 * adapter only when the vendor needs real custom logic (RSA signing, SOAP, an
 * SDK, multi-step OAuth dances).
 *
 * config.config shape:
 * {
 *   auth: { type: 'none'|'bearer'|'api_key'|'basic',
 *           token, header, key, username, password },
 *   endpoints: { employees, pushAttendance, leave },   // paths, relative to base_url
 *   methods:   { pushAttendance: 'POST' },              // optional, defaults below
 *   fieldMap:  { employee_code: 'emp_id', punch_time: 'timestamp',
 *                punch_state: 'direction' },            // our field -> their field
 *   employeesPath: 'data'                               // optional: where the array lives in the response
 * }
 */

const axios = require('axios');
const { BaseIntegration, CAPABILITY } = require('../hrms-integration');

class GenericRestIntegration extends BaseIntegration {
    // Declares the full REST set; a method returns a clear "not configured"
    // error when its endpoint is absent, so support tracks configuration.
    static capabilities = [
        CAPABILITY.PUSH_ATTENDANCE,
        CAPABILITY.PULL_EMPLOYEES,
        CAPABILITY.PULL_LEAVE,
    ];

    constructor(config) {
        super(config);
        const c = this.config || {};
        this.auth = c.auth || { type: 'none' };
        this.endpoints = c.endpoints || {};
        this.methods = c.methods || {};
        this.fieldMap = c.fieldMap || {};
        this.employeesPath = c.employeesPath || null;
        this.base = String(this.baseUrl || '').replace(/\/+$/, '');
        this.client = axios.create({ timeout: 30000 });
    }

    _authHeaders() {
        const a = this.auth || {};
        switch (a.type) {
            case 'bearer': return { Authorization: `Bearer ${a.token || ''}` };
            case 'api_key': return { [a.header || 'X-API-Key']: a.key || this.apiKey || '' };
            case 'basic': {
                const u = a.username || this.username || '';
                const p = a.password || this.password || '';
                return { Authorization: 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64') };
            }
            default: return {};
        }
    }

    _url(path) {
        if (!path) return '';
        return /^https?:\/\//i.test(path) ? path : this.base + (path.startsWith('/') ? path : '/' + path);
    }

    // Map one of our records to the vendor's field names.
    _mapOut(record) {
        const out = {};
        for (const [ours, theirs] of Object.entries(this.fieldMap)) {
            if (record[ours] !== undefined) out[theirs] = record[ours];
        }
        // pass through anything not remapped
        for (const [k, v] of Object.entries(record)) {
            if (!(k in this.fieldMap)) out[k] = v;
        }
        return out;
    }

    // Map a vendor employee back to ours (reverse of fieldMap).
    _mapIn(row) {
        const rev = Object.fromEntries(Object.entries(this.fieldMap).map(([k, v]) => [v, k]));
        const out = {};
        for (const [k, v] of Object.entries(row)) out[rev[k] || k] = v;
        return out;
    }

    async testConnection() {
        try {
            if (!this.base) throw new Error('base_url is required');
            const probe = this.endpoints.employees || this.endpoints.leave;
            if (probe) {
                const res = await this.client.get(this._url(probe), { headers: this._authHeaders() });
                return { success: res.status >= 200 && res.status < 300, message: `Connected (HTTP ${res.status}) to ${this._url(probe)}` };
            }
            // push-only vendor: nothing to GET, just confirm config is coherent
            if (!this.endpoints.pushAttendance) throw new Error('configure at least one endpoint (employees, leave, or pushAttendance)');
            return { success: true, message: 'Config OK. Attendance will POST to ' + this._url(this.endpoints.pushAttendance) };
        } catch (err) {
            const detail = err.response ? `HTTP ${err.response.status}` : err.message;
            return { success: false, message: detail, error: err.message };
        }
    }

    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        if (!this.endpoints.pushAttendance) throw new Error('pushAttendance endpoint not configured');
        if (!records || !records.length) return stats;
        const url = this._url(this.endpoints.pushAttendance);
        const method = (this.methods.pushAttendance || 'POST').toLowerCase();
        const payload = records.map(r => this._mapOut(r));
        stats.processed = records.length;
        try {
            await this.client.request({ url, method, headers: this._authHeaders(), data: payload });
            stats.success = records.length;
        } catch (err) {
            stats.failed = records.length;
            stats.error = err.response ? `HTTP ${err.response.status}` : err.message;
        }
        return stats;
    }

    async pullEmployees() {
        if (!this.endpoints.employees) throw new Error('employees endpoint not configured');
        const res = await this.client.get(this._url(this.endpoints.employees), { headers: this._authHeaders() });
        let rows = res.data;
        if (this.employeesPath) rows = this.employeesPath.split('.').reduce((o, k) => (o ? o[k] : undefined), rows);
        if (!Array.isArray(rows)) rows = [];
        return rows.map(r => this._mapIn(r));
    }

    async pullLeave() {
        if (!this.endpoints.leave) throw new Error('leave endpoint not configured');
        const res = await this.client.get(this._url(this.endpoints.leave), { headers: this._authHeaders() });
        return Array.isArray(res.data) ? res.data : (res.data?.data || []);
    }
}

module.exports = GenericRestIntegration;
