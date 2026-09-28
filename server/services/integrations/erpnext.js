/**
 * ERPNext Integration
 * 
 * Integrates with ERPNext/Frappe HRMS:
 * - Pull employees from Employee doctype
 * - Push attendance to Attendance doctype
 * - Auto-create attendance records
 * 
 * API Docs: https://frappeframework.com/docs/user/en/api
 * 
 * @author DevTeam
 * @version 1.0.0
 */

const axios = require('axios');
const https = require('https');
const { BaseIntegration } = require('../hrms-integration');

// Create HTTPS agent that allows self-signed certificates
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

class ERPNextIntegration extends BaseIntegration {
    // What this adapter implements; the engine reads this, the UI shows it.
    static capabilities = ['pull_employees', 'push_attendance'];

    constructor(config) {
        super(config);
        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `token ${this.apiKey}:${this.apiSecret}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000,
            httpsAgent: httpsAgent
        });
    }

    /**
     * Test connection to ERPNext
     */
    async testConnection() {
        try {
            const response = await this.client.get('/api/method/frappe.auth.get_logged_user');
            return {
                success: true,
                message: `Connected as ${response.data.message}`,
                user: response.data.message
            };
        } catch (err) {
            return {
                success: false,
                message: err.response?.data?.message || err.message,
                error: err.message
            };
        }
    }

    /**
     * Pull employees from ERPNext
     */
    async pullEmployees() {
        try {
            const response = await this.client.get('/api/resource/Employee', {
                params: {
                    fields: JSON.stringify([
                        'name', 'employee_name', 'company_email', 'cell_number',
                        'department', 'designation', 'status', 'date_of_joining'
                    ]),
                    filters: JSON.stringify([['status', '=', 'Active']]),
                    limit_page_length: 0  // Get all
                }
            });

            const employees = response.data.data.map(emp => ({
                employee_code: emp.name,
                name: emp.employee_name,
                email: emp.company_email,
                mobile: emp.cell_number,
                department_name: emp.department,
                designation: emp.designation,
                joining_date: emp.date_of_joining
            }));

            return employees;
        } catch (err) {
            const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
            console.error('ERPNext pull details:', detail);
            throw new Error(`ERPNext pull employees failed: ${detail}`);
        }
    }

    /**
     * Push attendance to ERPNext
     */
    /**
     * Push attendance to ERPNext (Employee Checkin)
     */
    async pushAttendance(records) {
        const stats = { processed: 0, success: 0, failed: 0 };
        const db = require('../../db');

        for (const record of records) {
            stats.processed++;
            try {
                // Determine Log Type (IN or OUT) from punch_state
                // Standard ZK: 0=CheckIn, 1=CheckOut, 2=BreakOut, 3=BreakIn, 4=OT-In, 5=OT-Out
                let logType = 'IN';
                const state = parseInt(record.punch_state || 0);
                if ([1, 2, 5].includes(state)) {
                    logType = 'OUT';
                }

                // Format timestamp manually to preserve wall-clock time
                // (Avoids timezone shifting issues if server/db mismatch)
                const d = new Date(record.punch_time);
                const timestamp = d.getFullYear() + "-" +
                    ("0" + (d.getMonth() + 1)).slice(-2) + "-" +
                    ("0" + d.getDate()).slice(-2) + " " +
                    ("0" + d.getHours()).slice(-2) + ":" +
                    ("0" + d.getMinutes()).slice(-2) + ":" +
                    ("0" + d.getSeconds()).slice(-2);

                await this.client.post('/api/resource/Employee%20Checkin', {
                    employee: record.employee_code,
                    time: timestamp,
                    log_type: logType,
                    device_id: record.device_id || 'MANUAL'
                });

                // Mark as synced (sync_status is VARCHAR)
                await db.query(`
                    UPDATE attendance_logs SET sync_status = 'synced' WHERE id = $1
                `, [record.id]);

                stats.success++;
            } catch (err) {
                // Check if duplicate (can happen on retry), consider success
                const isDuplicate = err.response?.data?.exc &&
                    (err.response.data.exc.includes('DuplicateEntryError') ||
                        err.response.data.exc.includes('UniqueValidationError'));

                if (isDuplicate) {
                    await db.query(`UPDATE attendance_logs SET sync_status = 'synced' WHERE id = $1`, [record.id]);
                    stats.success++;
                } else {
                    stats.failed++;
                    const errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                    console.error(`ERPNext checkin push failed for ${record.employee_code}:`, errorDetails);
                }
            }
        }

        return stats;
    }

    /**
     * Create or update employee in ERPNext
     */
    async pushEmployee(employee) {
        try {
            // Check if exists
            const checkResponse = await this.client.get(`/api/resource/Employee/${employee.employee_code}`);

            if (checkResponse.data.data) {
                // Update
                await this.client.put(`/api/resource/Employee/${employee.employee_code}`, {
                    employee_name: employee.name,
                    company_email: employee.email,
                    cell_number: employee.mobile
                });
            }
        } catch (err) {
            if (err.response?.status === 404) {
                // Create new
                await this.client.post('/api/resource/Employee', {
                    name: employee.employee_code,
                    employee_name: employee.name,
                    company_email: employee.email,
                    cell_number: employee.mobile,
                    gender: employee.gender || 'Male',
                    date_of_birth: employee.dob || '1990-01-01',
                    date_of_joining: employee.joining_date || new Date().toISOString().split('T')[0],
                    status: 'Active'
                });
            } else {
                throw err;
            }
        }
    }

    /**
     * Get attendance summary from ERPNext
     */
    async getAttendanceSummary(employeeCode, fromDate, toDate) {
        try {
            const response = await this.client.get('/api/resource/Attendance', {
                params: {
                    fields: JSON.stringify(['attendance_date', 'status', 'in_time', 'out_time']),
                    filters: JSON.stringify([
                        ['employee', '=', employeeCode],
                        ['attendance_date', '>=', fromDate],
                        ['attendance_date', '<=', toDate]
                    ])
                }
            });
            return response.data.data;
        } catch (err) {
            throw new Error(`ERPNext get attendance failed: ${err.message}`);
        }
    }
}

module.exports = ERPNextIntegration;
