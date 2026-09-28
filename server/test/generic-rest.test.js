/**
 * Generic REST adapter test — runs against a live in-process mock HRMS server,
 * so it proves real HTTP behaviour (auth header, field mapping, push + pull)
 * without any external vendor.
 *
 *   node test/generic-rest.test.js
 */

const assert = require('assert');
const http = require('http');
const GenericRest = require('../services/integrations/generic-rest');

let failures = 0;
const check = (name, ok, extra = '') => {
    if (ok) console.log(`  ok   ${name}`);
    else { failures++; console.log(`  FAIL ${name}${extra ? '\n       ' + extra : ''}`); }
};

(async () => {
    // Mock HRMS: records what it receives so we can assert on it.
    const received = { auth: null, pushed: null };
    const server = http.createServer((req, res) => {
        received.auth = req.headers['authorization'] || null;
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => {
            if (req.url === '/employees' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ data: [{ emp_id: '027', full_name: 'Akshay' }] }));
            } else if (req.url === '/attendance' && req.method === 'POST') {
                received.pushed = JSON.parse(body || '[]');
                res.writeHead(200); res.end('{"ok":true}');
            } else { res.writeHead(404); res.end(); }
        });
    });
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;

    const adapter = new GenericRest({
        type: 'generic_rest',
        base_url: `http://127.0.0.1:${port}`,
        config: {
            auth: { type: 'bearer', token: 'secret123' },
            endpoints: { employees: '/employees', pushAttendance: '/attendance' },
            employeesPath: 'data',
            fieldMap: { employee_code: 'emp_id', name: 'full_name' },
        },
    });

    console.log('generic REST adapter\n');

    const conn = await adapter.testConnection();
    check('testConnection succeeds against live endpoint', conn.success === true, JSON.stringify(conn));

    const emps = await adapter.pullEmployees();
    check('pullEmployees returns array', Array.isArray(emps) && emps.length === 1);
    check('pullEmployees maps vendor fields back (emp_id -> employee_code)',
        emps[0] && emps[0].employee_code === '027' && emps[0].name === 'Akshay',
        JSON.stringify(emps[0]));
    check('auth header sent as bearer token', received.auth === 'Bearer secret123', String(received.auth));

    const stats = await adapter.pushAttendance([{ employee_code: '027', punch_time: '2026-09-28T09:00:00' }]);
    check('pushAttendance reports success', stats.success === 1 && stats.failed === 0, JSON.stringify(stats));
    check('pushAttendance maps our field -> vendor field (employee_code -> emp_id)',
        received.pushed && received.pushed[0] && received.pushed[0].emp_id === '027',
        JSON.stringify(received.pushed));

    // unconfigured endpoint throws a clear error, not a silent success
    let threw = false;
    try { await adapter.pullLeave(); } catch (e) { threw = /not configured/.test(e.message); }
    check('unconfigured pullLeave throws "not configured"', threw);

    server.close();
    console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
    process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('test crashed:', e); process.exit(1); });
